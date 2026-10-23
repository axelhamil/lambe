import { describe, expect, mock, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import type { GenerationStats } from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider";
import type { FetchFn } from "./stream-support";

const API_KEY = "sk-secret-0123456789";

const messages: ChatMessage[] = [{ role: "user", content: "Translate: Hello" }];

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const delta = (content: string) => ({ choices: [{ delta: { content }, finish_reason: null }] });

const sse = (...events: unknown[]): string =>
  events
    .map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`)
    .join("");

const sseResponse = (...events: unknown[]): Response =>
  new Response(sse(...events), { headers: { "content-type": "text/event-stream" } });

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

interface ProviderSetup {
  baseUrl?: string;
  apiKey?: Option<string>;
  timeoutMs?: number;
  now?: () => number;
}

const providerWith = (fetch: FetchFn, setup: ProviderSetup = {}): OpenAiCompatibleProvider =>
  new OpenAiCompatibleProvider({
    baseUrl: setup.baseUrl ?? "https://api.example.com",
    model: "gpt-4o-mini",
    apiKey: setup.apiKey ?? Option.none(),
    fetch,
    timeoutMs: setup.timeoutMs ?? 1000,
    now: setup.now ?? (() => 0),
  });

const fetchReturning = (response: () => Response | Promise<Response>) =>
  mock(async (_input: RequestInfo | URL, _init?: RequestInit) => response());

const fetchRejecting = (error: unknown) =>
  mock(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    throw error;
  });

const hanging = () =>
  mock(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );

const reply = () => sseResponse(delta("Bonjour"), "[DONE]");

const errorOf = async (fetch: FetchFn, setup: ProviderSetup = {}) =>
  (await providerWith(fetch, setup).chat(messages, { contextTokens: 2048 })).getError();

describe("OpenAiCompatibleProvider", () => {
  test("streams_sse_deltas_and_finishes_on_done", async () => {
    const onText = mock((_delta: string) => {});
    const fetch = fetchReturning(() =>
      streamOf(
        [
          ": keep alive\n\n",
          sse(delta("Bon")),
          `${sse(delta("jour")).slice(0, 12)}`,
          `${sse(delta("jour")).slice(12)}${sse("[DONE]")}`,
        ],
        1,
        true,
      ),
    );

    const result = await providerWith(fetch).chat(messages, { contextTokens: 2048, onText });
    const [url, init] = fetch.mock.calls[0] ?? [];

    expect(result.getValue()).toBe("Bonjour");
    expect(onText.mock.calls.map(([text]) => text)).toEqual(["Bon", "jour"]);
    expect(String(url)).toBe("https://api.example.com/v1/chat/completions");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-4o-mini",
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0,
    });
  });

  test("sends_bearer_key_only_when_configured", async () => {
    const keyed = fetchReturning(reply);
    const anonymous = fetchReturning(reply);

    await providerWith(keyed, { apiKey: Option.some(API_KEY) }).chat(messages, {
      contextTokens: 2048,
    });
    await providerWith(anonymous).chat(messages, { contextTokens: 2048 });

    const headersOf = (fetch: typeof keyed) => new Headers(fetch.mock.calls[0]?.[1]?.headers);

    expect(headersOf(keyed).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(headersOf(anonymous).has("authorization")).toBe(false);
  });

  test("base_url_with_v1_suffix_is_not_doubled", async () => {
    const fetch = fetchReturning(reply);

    await providerWith(fetch, { baseUrl: "http://localhost:1234/v1" }).chat(messages, {
      contextTokens: 2048,
    });

    expect(String(fetch.mock.calls[0]?.[0])).toBe("http://localhost:1234/v1/chat/completions");
  });

  test("trailing_slash_base_url_is_normalized", async () => {
    const plain = fetchReturning(reply);
    const versioned = fetchReturning(reply);

    await providerWith(plain, { baseUrl: "http://localhost:1234//" }).chat(messages, {
      contextTokens: 2048,
    });
    await providerWith(versioned, { baseUrl: "http://localhost:1234/v1/" }).chat(messages, {
      contextTokens: 2048,
    });

    expect(String(plain.mock.calls[0]?.[0])).toBe("http://localhost:1234/v1/chat/completions");
    expect(String(versioned.mock.calls[0]?.[0])).toBe("http://localhost:1234/v1/chat/completions");
  });

  test("401_maps_to_provider_unauthorized", async () => {
    const error = await errorOf(fetchReturning(() => json({ error: { message: "bad key" } }, 401)));

    expect(error.code).toBe("PROVIDER_UNAUTHORIZED");
    expect(error.params).toEqual({ baseUrl: "https://api.example.com" });
  });

  test("429_maps_to_rate_limited_with_the_retry_after_delay", async () => {
    const limited = () =>
      new Response("slow down", { status: 429, headers: { "retry-after": "2" } });

    const error = await errorOf(fetchReturning(limited));

    expect(error.code).toBe("PROVIDER_RATE_LIMITED");
    expect(error.params).toEqual({ retryAfterMs: "2000" });
  });

  test("404_maps_to_model_missing", async () => {
    const error = await errorOf(fetchReturning(() => json({ error: { message: "no" } }, 404)));

    expect(error.code).toBe("PROVIDER_MODEL_MISSING");
    expect(error.params).toEqual({ model: "gpt-4o-mini" });
  });

  test("unreachable_host_maps_to_provider_unreachable", async () => {
    const error = await errorOf(fetchRejecting(new TypeError("fetch failed")));

    expect(error.code).toBe("PROVIDER_UNREACHABLE");
    expect(error.params).toEqual({ baseUrl: "https://api.example.com" });
  });

  test("idle_stream_times_out", async () => {
    const stalled = await errorOf(
      fetchReturning(() => streamOf([sse(delta("Bon"))], 1, true)),
      { timeoutMs: 20 },
    );
    const silent = await errorOf(hanging(), { timeoutMs: 10 });

    expect(stalled.code).toBe("PROVIDER_TIMEOUT");
    expect(stalled.params).toEqual({ timeoutMs: "20" });
    expect(silent.code).toBe("PROVIDER_TIMEOUT");
  });

  test("abort_signal_maps_to_request_cancelled", async () => {
    const controller = new AbortController();
    const fetch = hanging();
    const pending = providerWith(fetch).chat(messages, {
      contextTokens: 2048,
      signal: controller.signal,
    });

    controller.abort();
    const cancelled = await pending;

    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(cancelled.getError().code).toBe("REQUEST_CANCELLED");
  });

  test("usage_chunk_becomes_generation_stats", async () => {
    const onStats = mock((_stats: GenerationStats) => {});
    const clock = [1000, 1840];
    const fetch = fetchReturning(() =>
      sseResponse(
        delta("Bonjour"),
        { choices: [], usage: { prompt_tokens: 322, completion_tokens: 79, total_tokens: 401 } },
        "[DONE]",
      ),
    );

    await providerWith(fetch, { now: () => clock.shift() ?? 0 }).chat(messages, {
      contextTokens: 2048,
      onStats,
    });

    expect(onStats.mock.calls).toEqual([
      [{ loadMs: 0, promptTokens: 322, promptMs: 0, outputTokens: 79, outputMs: 0, totalMs: 840 }],
    ]);
  });

  test("lists_models_from_v1_models", async () => {
    const fetch = fetchReturning(() =>
      json({ object: "list", data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] }),
    );

    const models = await providerWith(fetch, {
      baseUrl: "https://api.example.com/v1/",
      apiKey: Option.some(API_KEY),
    }).listModels();
    const [url, init] = fetch.mock.calls[0] ?? [];

    expect(String(url)).toBe("https://api.example.com/v1/models");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(models.getValue()).toEqual(["gpt-4o-mini", "gpt-4o"]);
  });

  test("api_key_never_appears_in_error_messages", async () => {
    const apiKey = Option.some(API_KEY);
    const echoed = `Incorrect API key provided: ${API_KEY}.`;
    const errors = [
      await errorOf(
        fetchReturning(() => json({ error: { message: echoed } }, 401)),
        { apiKey },
      ),
      await errorOf(fetchRejecting(new TypeError(`connect failed for ${API_KEY}`)), { apiKey }),
      await errorOf(
        fetchReturning(() => sseResponse({ error: { message: echoed } })),
        { apiKey },
      ),
      (
        await providerWith(
          fetchReturning(() => json({ error: { message: echoed } }, 500)),
          {
            apiKey,
          },
        ).listModels()
      ).getError(),
    ];

    for (const error of errors) {
      expect(JSON.stringify(error)).not.toContain(API_KEY);
    }
  });
});
