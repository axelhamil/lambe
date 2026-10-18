import { describe, expect, mock, test } from "bun:test";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type FetchFn, OllamaProvider } from "./ollama-provider";

const ORIGIN = "chrome-extension://abcdefghijklmnop";

const messages: ChatMessage[] = [{ role: "user", content: "Translate: Hello" }];

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const providerWith = (fetch: FetchFn): OllamaProvider =>
  new OllamaProvider({
    baseUrl: "http://localhost:11434",
    model: "translategemma:12b",
    fetch,
    timeoutMs: 1000,
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
    const fetch = fetchReturning(() =>
      json({ message: { role: "assistant", content: "Bonjour" } }),
    );

    await providerWith(fetch).chat(messages, { contextTokens: 2048 });

    const [url, init] = fetch.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://localhost:11434/api/chat");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "translategemma:12b",
      messages,
      stream: false,
      keep_alive: "10m",
      options: { temperature: 0, num_ctx: 2048 },
    });
  });

  test("returns_message_content", async () => {
    const fetch = fetchReturning(() =>
      json({ message: { role: "assistant", content: "Bonjour" } }),
    );

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
      fetchReturning(() => json({ message: { role: "assistant" } })),
    );

    expect(garbage.code).toBe("PROVIDER_BAD_RESPONSE");
    expect(missingContent.code).toBe("PROVIDER_BAD_RESPONSE");
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

      return json({ message: { role: "assistant", content: "Bonjour" } });
    });

    const result = await providerWith(fetch).chat(messages, { contextTokens: 2048 });

    expect(result.getValue()).toBe("Bonjour");
  });

  test("maps_empty_content_to_PROVIDER_BAD_RESPONSE", async () => {
    const error = await errorOf(
      fetchReturning(() => json({ message: { role: "assistant", content: "" } })),
    );

    expect(error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  test("does_not_retry_on_403", async () => {
    const fetch = fetchReturning(() => new Response("", { status: 403 }));

    await providerWith(fetch).chat(messages, { contextTokens: 2048 });

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
