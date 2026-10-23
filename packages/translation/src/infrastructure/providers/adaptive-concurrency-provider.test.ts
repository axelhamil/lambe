import { describe, expect, mock, test } from "bun:test";
import { Result } from "@lambe/kernel/result";
import type {
  ChatOptions,
  TranslationProvider,
} from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type ProviderError, providerError } from "../../domain/provider/provider-error";
import {
  type AdaptiveConcurrencyOptions,
  AdaptiveConcurrencyProvider,
} from "./adaptive-concurrency-provider";

type ChatResult = Result<string, ProviderError>;

interface Stream {
  content: string;
  emit(delta: string): void;
  finish(): void;
}

const ask = (content: string): ChatMessage[] => [{ role: "user", content }];

const options = { contextTokens: 2048 };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function controllableServer() {
  const streams: Stream[] = [];
  const chat = mock(
    (messages: ChatMessage[], chatOptions: ChatOptions) =>
      new Promise<ChatResult>((resolve) => {
        const content = messages[0]?.content ?? "";

        streams.push({
          content,
          emit: (delta) => chatOptions.onText?.(delta),
          finish: () => resolve(Result.ok(content)),
        });
      }),
  );
  const inner: TranslationProvider = { id: "ollama", model: "translategemma:12b", chat };

  return { inner, streams, chat };
}

function adaptive(inner: TranslationProvider, overrides: Partial<AdaptiveConcurrencyOptions> = {}) {
  return new AdaptiveConcurrencyProvider(inner, {
    maxConcurrency: 4,
    forgetAfterIdleMs: 30_000,
    now: () => 0,
    ...overrides,
  });
}

const started = (streams: Stream[]): string[] => streams.map((stream) => stream.content);

describe("AdaptiveConcurrencyProvider", () => {
  test("auto_concurrency_rises_when_streams_interleave", async () => {
    const { inner, streams } = controllableServer();
    const provider = adaptive(inner);

    for (const content of ["a", "b", "c", "d"]) void provider.chat(ask(content), options);

    await settle();
    streams[0]?.emit("Bon");
    streams[1]?.emit("Sal");
    await settle();

    expect(provider.concurrency().unwrap()).toBe(2);
    expect(started(streams)).toEqual(["a", "b", "c"]);
  });

  test("auto_concurrency_stays_at_one_when_streams_serialize", async () => {
    const { inner, streams } = controllableServer();
    const provider = adaptive(inner);

    for (const content of ["a", "b", "c"]) void provider.chat(ask(content), options);

    await settle();
    streams[0]?.emit("Bon");
    streams[0]?.finish();
    await settle();
    streams[1]?.emit("Sal");
    await settle();

    expect(provider.concurrency().unwrap()).toBe(1);
    expect(started(streams)).toEqual(["a", "b", "c"]);
    expect(streams).toHaveLength(3);
  });

  test("keeps_one_call_queued_ahead_of_the_streaming_slots", async () => {
    const { inner, streams } = controllableServer();
    const provider = adaptive(inner);

    for (const content of ["a", "b", "c"]) void provider.chat(ask(content), options);

    await settle();

    expect(started(streams)).toEqual(["a", "b"]);

    streams[0]?.finish();
    await settle();

    expect(started(streams)).toEqual(["a", "b", "c"]);
  });

  test("never_rises_above_the_configured_upper_bound", async () => {
    const { inner, streams } = controllableServer();
    const provider = adaptive(inner, { maxConcurrency: 2 });

    for (const content of ["a", "b", "c", "d", "e"]) void provider.chat(ask(content), options);

    for (let round = 0; round < 3; round += 1) {
      await settle();

      for (const stream of streams) stream.emit("x");
    }

    expect(provider.concurrency().unwrap()).toBe(2);
    expect(streams).toHaveLength(3);
  });

  test("probes_again_after_an_idle_gap_that_unloads_the_model", async () => {
    let clock = 0;
    const { inner, streams } = controllableServer();
    const provider = adaptive(inner, { now: () => clock });

    void provider.chat(ask("a"), options);
    void provider.chat(ask("b"), options);
    await settle();
    streams[0]?.emit("x");
    streams[1]?.emit("y");
    streams[0]?.finish();
    streams[1]?.finish();
    await settle();

    expect(provider.concurrency().unwrap()).toBe(2);

    clock = 30_000;
    void provider.chat(ask("c"), options);
    await settle();

    expect(provider.concurrency().unwrap()).toBe(1);
  });

  test("maps_an_inner_rejection_to_a_failure_and_releases_the_slot", async () => {
    const chat = mock(async (messages: ChatMessage[]): Promise<ChatResult> => {
      if (messages[0]?.content === "boom") throw new Error("boom");

      return Result.ok("ok");
    });
    const provider = adaptive({ id: "ollama", model: "translategemma:12b", chat });

    const [rejected, ...rest] = await Promise.all(
      ["boom", "next", "last"].map((content) => provider.chat(ask(content), options)),
    );

    expect(rejected?.getError().code).toBe("PROVIDER_UNREACHABLE");
    expect(rest.map((result) => result.getValue())).toEqual(["ok", "ok"]);
  });

  test("rejects_an_upper_bound_that_is_not_a_positive_integer", () => {
    const { inner } = controllableServer();

    for (const maxConcurrency of [0, -1, 1.5, Number.NaN]) {
      expect(() => adaptive(inner, { maxConcurrency })).toThrow(RangeError);
    }
  });

  test("rate_limited_call_is_retried_after_the_advised_delay_then_with_backoff", async () => {
    const answers: ChatResult[] = [
      Result.fail(providerError("PROVIDER_RATE_LIMITED", "slow", { retryAfterMs: "500" })),
      Result.fail(providerError("PROVIDER_RATE_LIMITED", "slow")),
      Result.ok("done"),
    ];
    const extra: ChatResult = Result.ok("extra");
    const chat = mock(async () => answers.shift() ?? extra);
    const sleep = mock(async (_ms: number) => undefined);

    const result = await adaptive({ id: "openai", model: "gpt", chat }, { sleep }).chat(
      ask("Hello"),
      options,
    );

    expect(result.getValue()).toBe("done");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 2000]);
  });

  test("rate_limited_wait_stops_when_the_request_is_cancelled", async () => {
    const controller = new AbortController();
    const chat = mock(async () =>
      Result.fail<string, ProviderError>(providerError("PROVIDER_RATE_LIMITED", "slow")),
    );
    const sleep = mock(async () => controller.abort());

    const result = await adaptive({ id: "openai", model: "gpt", chat }, { sleep }).chat(
      ask("Hello"),
      { ...options, signal: controller.signal },
    );

    expect(result.getError().code).toBe("REQUEST_CANCELLED");
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
