import { describe, expect, mock, test } from "bun:test";
import type { GenerationStats } from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type FetchFn, OllamaProvider } from "./ollama-provider";

const ORIGIN = "chrome-extension://abcdefghijklmnop";

const messages: ChatMessage[] = [{ role: "user", content: "Translate: Hello" }];

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ndjson = (...chunks: unknown[]): Response =>
  new Response(chunks.map((chunk) => JSON.stringify(chunk)).join("\n"), {
    headers: { "content-type": "application/x-ndjson" },
  });

const reply = (content: string): Response =>
  ndjson(
    { message: { role: "assistant", content }, done: false },
    { message: { role: "assistant", content: "" }, done: true },
  );

const streamOf = (parts: string[], gapMs: number, stall = false): Response => {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const part of parts) {
          await new Promise((resolve) => setTimeout(resolve, gapMs));
          controller.enqueue(encoder.encode(part));
        }

        if (!stall) controller.close();
      },
    }),
  );
};

const providerWith = (fetch: FetchFn, timeoutMs = 1000): OllamaProvider =>
  new OllamaProvider({
    baseUrl: "http://localhost:11434",
    model: "translategemma:12b",
    fetch,
    timeoutMs,
    forbiddenHint: ORIGIN,
  });

const fetchReturning = (response: () => Response | Promise<Response>) =>
  mock(async (_input: RequestInfo | URL, _init?: RequestInit) => response());

const fetchRejecting = (error: unknown) =>
  mock(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    throw error;
  });

const errorOf = async (fetch: FetchFn) =>
  (await providerWith(fetch).chat(messages, { contextTokens: 2048 })).getError();

describe("OllamaProvider", () => {
  test("posts_native_chat_payload_with_num_ctx_and_zero_temperature", async () => {
    const fetch = fetchReturning(() => reply("Bonjour"));

    await providerWith(fetch).chat(messages, { contextTokens: 2048 });

    const [url, init] = fetch.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://localhost:11434/api/chat");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "translategemma:12b",
      messages,
      stream: true,
      keep_alive: "10m",
      options: { temperature: 0, num_ctx: 2048 },
    });
  });

  test("caps_the_reply_with_num_predict_when_asked", async () => {
    const fetch = fetchReturning(() => reply("Bonjour"));

    await providerWith(fetch).chat(messages, { contextTokens: 2048, maxOutputTokens: 120 });

    const [, init] = fetch.mock.calls[0] ?? [];

    expect(JSON.parse(String(init?.body)).options).toEqual({
      temperature: 0,
      num_ctx: 2048,
      num_predict: 120,
    });
  });

  test("returns_message_content", async () => {
    const fetch = fetchReturning(() => reply("Bonjour"));

    const result = await providerWith(fetch).chat(messages, { contextTokens: 2048 });

    expect(result.getValue()).toBe("Bonjour");
  });

  test("maps_403_to_PROVIDER_FORBIDDEN_ORIGIN_with_the_systemd_fix_in_the_message", async () => {
    const error = await errorOf(fetchReturning(() => new Response("", { status: 403 })));

    expect(error.code).toBe("PROVIDER_FORBIDDEN_ORIGIN");
    expect(error.message).toContain(`OLLAMA_ORIGINS=${ORIGIN}`);
    expect(error.message).toContain("systemctl edit ollama");
  });

  test("maps_connection_refused_to_PROVIDER_UNREACHABLE", async () => {
    const error = await errorOf(fetchRejecting(new TypeError("fetch failed")));

    expect(error.code).toBe("PROVIDER_UNREACHABLE");
  });

  test("maps_404_to_PROVIDER_MODEL_MISSING", async () => {
    const error = await errorOf(
      fetchReturning(() => json({ error: "model 'translategemma:12b' not found" }, 404)),
    );

    expect(error.code).toBe("PROVIDER_MODEL_MISSING");
    expect(error.message).toContain("ollama pull translategemma:12b");
  });

  test("maps_garbage_body_to_PROVIDER_BAD_RESPONSE", async () => {
    const garbage = await errorOf(fetchReturning(() => new Response("<html>nope</html>")));
    const missingContent = await errorOf(
      fetchReturning(() => ndjson({ message: { role: "assistant" }, done: true })),
    );
    const neverDone = await errorOf(
      fetchReturning(() => ndjson({ message: { role: "assistant", content: "Bon" }, done: false })),
    );

    expect(garbage.code).toBe("PROVIDER_BAD_RESPONSE");
    expect(missingContent.code).toBe("PROVIDER_BAD_RESPONSE");
    expect(neverDone.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  test("concatenates_a_stream_split_mid_line", async () => {
    const body = [
      JSON.stringify({ message: { role: "assistant", content: "Bon" }, done: false }),
      JSON.stringify({ message: { role: "assistant", content: "jour" }, done: false }),
      JSON.stringify({ message: { role: "assistant", content: "" }, done: true }),
    ].join("\n");
    const parts = [body.slice(0, 17), body.slice(17, 70), body.slice(70)];

    const result = await providerWith(fetchReturning(() => streamOf(parts, 1))).chat(messages, {
      contextTokens: 2048,
    });

    expect(result.getValue()).toBe("Bonjour");
  });

  test("maps_an_error_line_to_PROVIDER_BAD_RESPONSE", async () => {
    const error = await errorOf(
      fetchReturning(() =>
        ndjson(
          { message: { role: "assistant", content: "Bon" }, done: false },
          { error: "model runner has unexpectedly stopped" },
        ),
      ),
    );

    expect(error.code).toBe("PROVIDER_BAD_RESPONSE");
    expect(error.message).toContain("model runner has unexpectedly stopped");
  });

  test("idle_timeout_resets_on_every_chunk", async () => {
    const lines = ["Un", " deux", " trois", " quatre", " cinq"].map(
      (content) => `${JSON.stringify({ message: { role: "assistant", content }, done: false })}\n`,
    );
    const parts = [...lines, JSON.stringify({ message: { content: "" }, done: true })];
    const slow = await providerWith(
      fetchReturning(() => streamOf(parts, 15)),
      40,
    ).chat(messages, { contextTokens: 2048 });
    const stalled = await providerWith(
      fetchReturning(() => streamOf(lines.slice(0, 1), 1, true)),
      20,
    ).chat(messages, { contextTokens: 2048 });

    expect(slow.getValue()).toBe("Un deux trois quatre cinq");
    expect(stalled.getError().code).toBe("PROVIDER_TIMEOUT");
  });

  test("maps_abort_to_PROVIDER_TIMEOUT", async () => {
    const aborted = await errorOf(fetchRejecting(new DOMException("aborted", "AbortError")));
    const timedOut = await errorOf(fetchRejecting(new DOMException("timed out", "TimeoutError")));

    expect(aborted.code).toBe("PROVIDER_TIMEOUT");
    expect(timedOut.code).toBe("PROVIDER_TIMEOUT");
  });

  test("times_out_a_hanging_request", async () => {
    const fetch = mock(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const provider = new OllamaProvider({
      baseUrl: "http://localhost:11434",
      model: "translategemma:12b",
      fetch,
      timeoutMs: 10,
      forbiddenHint: ORIGIN,
    });

    const result = await provider.chat(messages, { contextTokens: 2048 });

    expect(result.getError().code).toBe("PROVIDER_TIMEOUT");
  });

  test("maps_a_body_read_failure_to_PROVIDER_BAD_RESPONSE", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });

    const error = await errorOf(fetchReturning(() => new Response(broken)));

    expect(error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  test("calls_the_injected_fetch_unbound", async () => {
    const fetch = mock(async function (this: unknown): Promise<Response> {
      if (this !== undefined) throw new TypeError("Illegal invocation");

      return reply("Bonjour");
    });

    const result = await providerWith(fetch).chat(messages, { contextTokens: 2048 });

    expect(result.getValue()).toBe("Bonjour");
  });

  test("maps_empty_content_to_PROVIDER_BAD_RESPONSE", async () => {
    const error = await errorOf(fetchReturning(() => reply("")));

    expect(error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  test("ollama_provider_calls_onText_per_delta_and_aborts_on_signal", async () => {
    const lines = ["Bon", "jour", ""].map(
      (content, index) =>
        `${JSON.stringify({ message: { role: "assistant", content }, done: index === 2 })}\n`,
    );
    const onText = mock((_delta: string) => {});
    const streamed = await providerWith(fetchReturning(() => streamOf(lines, 1))).chat(messages, {
      contextTokens: 2048,
      onText,
    });
    const controller = new AbortController();
    const fetch = mock(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const pending = providerWith(fetch).chat(messages, {
      contextTokens: 2048,
      signal: controller.signal,
    });

    controller.abort();
    const cancelled = await pending;

    expect(streamed.getValue()).toBe("Bonjour");
    expect(onText.mock.calls.map(([delta]) => delta)).toEqual(["Bon", "jour"]);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(cancelled.getError().code).toBe("REQUEST_CANCELLED");
  });

  test("reports_the_final_chunk_stats_in_milliseconds", async () => {
    const onStats = mock((_stats: GenerationStats) => {});
    const fetch = fetchReturning(() =>
      ndjson(
        { message: { role: "assistant", content: "Bonjour" }, done: false },
        {
          message: { role: "assistant", content: "" },
          done: true,
          load_duration: 120_400_000,
          prompt_eval_count: 322,
          prompt_eval_duration: 76_000_000,
          eval_count: 79,
          eval_duration: 930_000_000,
          total_duration: 1_180_000_000,
        },
      ),
    );

    await providerWith(fetch).chat(messages, { contextTokens: 2048, onStats });

    expect(onStats.mock.calls).toEqual([
      [
        {
          loadMs: 120,
          promptTokens: 322,
          promptMs: 76,
          outputTokens: 79,
          outputMs: 930,
          totalMs: 1180,
        },
      ],
    ]);
  });

  test("does_not_retry_on_403", async () => {
    const fetch = fetchReturning(() => new Response("", { status: 403 }));

    await providerWith(fetch).chat(messages, { contextTokens: 2048 });

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
