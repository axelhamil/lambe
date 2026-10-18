import { describe, expect, mock, test } from "bun:test";
import { Result } from "@lambe/kernel/result";
import type {
  ChatOptions,
  TranslationProvider,
} from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import type { ProviderError } from "../../domain/provider/provider-error";
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

    expect(provider.concurrency()).toBe(2);
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

    expect(provider.concurrency()).toBe(1);
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

    expect(provider.concurrency()).toBe(2);
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

    expect(provider.concurrency()).toBe(2);

    clock = 30_000;
    void provider.chat(ask("c"), options);
    await settle();

    expect(provider.concurrency()).toBe(1);
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
});
