import { describe, expect, mock, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type {
  BatchRequest,
  BatchTranslateOptions,
  SegmentOutcome,
} from "@lambe/translation/application/batch-translation.service";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import { requestCancelled } from "@lambe/translation/domain/provider/provider-error";
import { fakeRuntimePort } from "./testing/fake-runtime-port";
import { respondToTranslateBatch, serveTranslatePort } from "./translate-batch.handler";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const payload = {
  segments: [{ id: "0", markup: "Hello" }],
  source: "en",
  target: "fr",
  brief: {
    host: "x.test",
    url: "https://x.test/",
    title: "",
    description: "",
    headings: [],
    sourceLanguage: null,
  },
  cachePolicy: "use",
};

describe("respondToTranslateBatch", () => {
  test("answers_with_the_service_outcomes", async () => {
    const outcomes: SegmentOutcome[] = [
      { id: "0", status: "translated", markup: "Bonjour", fromCache: true },
    ];
    const translate = mock(
      async (): Promise<Result<SegmentOutcome[], ProviderError>> => Result.ok(outcomes),
    );

    const response = await respondToTranslateBatch(payload, { translate });

    expect(response).toEqual({ ok: true, outcomes });
  });

  test("invalid_payload_and_thrown_service_map_to_error_responses", async () => {
    const translate = mock(async () => Promise.reject(new Error("boom")));

    const invalid = await respondToTranslateBatch({ ...payload, target: "?" }, { translate });
    const thrown = await respondToTranslateBatch(payload, { translate });

    expect(invalid).toMatchObject({ ok: false, error: { code: "PROVIDER_BAD_RESPONSE" } });
    expect(thrown).toMatchObject({ ok: false, error: { code: "PROVIDER_UNREACHABLE" } });
  });

  test("worker_aborts_provider_on_cancel_message_and_on_disconnect", async () => {
    const { port, deliver, disconnect, posted } = fakeRuntimePort();
    const signals: AbortSignal[] = [];
    const translate = mock(
      (_request: BatchRequest, options?: BatchTranslateOptions) =>
        new Promise<Result<SegmentOutcome[], ProviderError>>((resolve) => {
          const signal = options?.signal;

          if (signal === undefined) return;

          signals.push(signal);
          options?.onOutcome?.({ id: "0", status: "translated", markup: "Bon", fromCache: false });
          signal.addEventListener("abort", () => resolve(Result.fail(requestCancelled())));
        }),
    );
    serveTranslatePort(
      port,
      (body, options) => respondToTranslateBatch(body, { translate }, options),
      { concurrency: () => Option.some(2) },
    );

    deliver({ type: "translate", requestId: "1", payload });
    deliver({ type: "translate", requestId: "2", payload });
    deliver({ type: "cancel", requestId: "1" });
    await tick();
    const abortedByCancel = signals.map((signal) => signal.aborted);
    disconnect();
    await tick();

    expect(abortedByCancel).toEqual([true, false]);
    expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
    expect(posted()).toEqual([
      { type: "capacity", concurrency: 2 },
      { type: "outcome", requestId: "1", outcome: expect.objectContaining({ markup: "Bon" }) },
      { type: "outcome", requestId: "2", outcome: expect.objectContaining({ markup: "Bon" }) },
      {
        type: "done",
        requestId: "1",
        response: { ok: false, error: expect.objectContaining({ code: "REQUEST_CANCELLED" }) },
        concurrency: 2,
      },
    ]);
  });

  test("worker_tells_a_new_page_the_concurrency_it_learned_and_nothing_before_learning", async () => {
    const translate = mock(
      async (): Promise<Result<SegmentOutcome[], ProviderError>> => Result.ok([]),
    );
    const respond = (body: unknown, options: BatchTranslateOptions) =>
      respondToTranslateBatch(body, { translate }, options);
    const learned = fakeRuntimePort();
    const fresh = fakeRuntimePort();

    serveTranslatePort(learned.port, respond, { concurrency: () => Option.some(1) });
    serveTranslatePort(fresh.port, respond, { concurrency: () => Option.none() });
    fresh.deliver({ type: "translate", requestId: "1", payload });
    await tick();

    expect(learned.posted()).toEqual([{ type: "capacity", concurrency: 1 }]);
    expect(fresh.posted()).toEqual([
      { type: "done", requestId: "1", response: { ok: true, outcomes: [] } },
    ]);
  });
});
