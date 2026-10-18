import { describe, expect, mock, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import type {
  BatchRequest,
  SegmentOutcome,
} from "@lambe/translation/application/batch-translation.service";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import { fakeRuntimePort } from "../../messaging/testing/fake-runtime-port";
import { PortBatchTranslator } from "./port-batch-translator";

const request: BatchRequest = {
  segments: [{ id: "0", markup: "Hello" }],
  source: Option.none(),
  target: LanguageCode.create("fr").getValue(),
  brief: {
    host: "x.test",
    title: "",
    description: "",
    headings: [],
    sourceLanguage: Option.none(),
  },
  cachePolicy: "use",
};

const bonjour: SegmentOutcome = {
  id: "0",
  status: "translated",
  markup: "Bonjour",
  fromCache: false,
};

function setup() {
  const ports = [fakeRuntimePort(), fakeRuntimePort()];
  let opened = 0;
  const connect = mock(() => {
    const next = ports[opened];

    opened += 1;

    if (next === undefined) throw new Error("No more ports.");

    return next.port;
  });
  const translator = new PortBatchTranslator(connect);

  return { ports, connect, translator };
}

describe("PortBatchTranslator", () => {
  test("streams_outcomes_then_resolves_with_the_done_response_on_one_lazy_port", async () => {
    const { ports, connect, translator } = setup();
    const [first] = ports;
    const onOutcome = mock((_outcome: SegmentOutcome) => {});
    expect(connect).not.toHaveBeenCalled();

    const pending = translator.translate(request, { onOutcome });
    first?.deliver({ type: "outcome", requestId: "1", outcome: bonjour });
    first?.deliver({ type: "done", requestId: "1", response: { ok: true, outcomes: [bonjour] } });
    const result = await pending;
    const second = translator.translate(request);
    first?.deliver({ type: "done", requestId: "2", response: { ok: true, outcomes: [] } });
    await second;

    expect(onOutcome.mock.calls).toEqual([[bonjour]]);
    expect(result.getValue()).toEqual([bonjour]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(first?.posted()[0]).toMatchObject({
      type: "translate",
      requestId: "1",
      payload: { target: "fr", source: null, cachePolicy: "use" },
    });
  });

  test("error_and_malformed_done_messages_map_to_failures", async () => {
    const { ports, translator } = setup();
    const [first] = ports;
    const error: ProviderError = { code: "PROVIDER_TIMEOUT", message: "Ollama did not answer." };

    const failing = translator.translate(request);
    const malformed = translator.translate(request);
    first?.deliver({ type: "done", requestId: "1", response: { ok: false, error } });
    first?.deliver({ type: "done", requestId: "2", response: "nope" });

    expect((await failing).getError()).toEqual(error);
    expect((await malformed).getError().code).toBe("PROVIDER_BAD_RESPONSE");
  });

  test("aborted_signal_posts_cancel_and_fails_with_REQUEST_CANCELLED", async () => {
    const { ports, translator } = setup();
    const controller = new AbortController();

    const pending = translator.translate(request, { signal: controller.signal });
    controller.abort();

    expect((await pending).getError().code).toBe("REQUEST_CANCELLED");
    expect(ports[0]?.posted()[1]).toEqual({ type: "cancel", requestId: "1" });
  });

  test("port_disconnect_fails_pending_requests_with_REQUEST_CANCELLED_and_reconnects", async () => {
    const { ports, connect, translator } = setup();
    const [first, second] = ports;

    const pending = translator.translate(request);
    first?.disconnect();
    const cancelled = await pending;
    const retried = translator.translate(request);
    second?.deliver({ type: "done", requestId: "2", response: { ok: true, outcomes: [bonjour] } });

    expect(cancelled.getError().code).toBe("REQUEST_CANCELLED");
    expect((await retried).getValue()).toEqual([bonjour]);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test("connect_failure_maps_to_PROVIDER_UNREACHABLE", async () => {
    const translator = new PortBatchTranslator(
      mock(() => {
        throw new Error("Extension context invalidated.");
      }),
    );

    const result = await translator.translate(request);

    expect(result.getError()).toMatchObject({
      code: "PROVIDER_UNREACHABLE",
      message: expect.stringContaining("Extension context invalidated."),
    });
  });
});
