import { Result } from "@lambe/kernel/result";
import { z } from "zod";
import type {
  ChatOptions,
  GenerationStats,
  TranslationProvider,
} from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import {
  type ProviderError,
  providerError,
  requestCancelled,
} from "../../domain/provider/provider-error";

export const KEEP_ALIVE_MS = 30_000;

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  fetch: FetchFn;
  timeoutMs: number;
  forbiddenHint: string;
}

type ChatResult = Result<string, ProviderError>;

const counter = z.number().nonnegative().default(0);

const chatChunkSchema = z.union([
  z.object({ error: z.string() }),
  z.object({
    message: z.object({ content: z.string() }),
    done: z.boolean(),
    load_duration: counter,
    prompt_eval_count: counter,
    prompt_eval_duration: counter,
    eval_count: counter,
    eval_duration: counter,
    total_duration: counter,
  }),
]);

type ChatChunk = z.infer<typeof chatChunkSchema>;

type ContentChunk = Exclude<ChatChunk, { error: string }>;

const NANOS_PER_MS = 1_000_000;

function statsOf(chunk: ContentChunk): GenerationStats {
  const ms = (nanos: number) => Math.round(nanos / NANOS_PER_MS);

  return {
    loadMs: ms(chunk.load_duration),
    promptTokens: chunk.prompt_eval_count,
    promptMs: ms(chunk.prompt_eval_duration),
    outputTokens: chunk.eval_count,
    outputMs: ms(chunk.eval_duration),
    totalMs: ms(chunk.total_duration),
  };
}

interface StreamListeners {
  onText: (delta: string) => void;
  onStats: (stats: GenerationStats) => void;
}

interface IdleTimer {
  reset(): void;
  clear(): void;
}

function idleTimer(timeoutMs: number, onIdle: () => void): IdleTimer {
  let timer = setTimeout(onIdle, timeoutMs);

  return {
    reset() {
      clearTimeout(timer);
      timer = setTimeout(onIdle, timeoutMs);
    },
    clear() {
      clearTimeout(timer);
    },
  };
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);

    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function jsonOf(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function parseChunk(line: string): Result<ChatChunk, ProviderError> {
  const parsed = chatChunkSchema.safeParse(jsonOf(line));

  if (parsed.success) return Result.ok(parsed.data);

  return Result.fail(
    providerError("PROVIDER_BAD_RESPONSE", "Ollama streamed a line that is not a chat chunk."),
  );
}

class ChunkAccumulator {
  private content = "";
  private finished = false;

  public constructor(private readonly listeners: StreamListeners) {}

  public push(line: string): Result<void, ProviderError> {
    if (line.trim() === "" || this.finished) return Result.ok();

    return parseChunk(line).flatMap((chunk): Result<void, ProviderError> => {
      if ("error" in chunk) {
        return Result.fail(
          providerError("PROVIDER_BAD_RESPONSE", `Ollama reported an error: ${chunk.error}`),
        );
      }

      const delta = chunk.message.content;

      this.content += delta;
      this.finished = chunk.done;

      if (delta !== "") this.listeners.onText(delta);

      if (chunk.done) this.listeners.onStats(statsOf(chunk));

      return Result.ok();
    });
  }

  public isDone(): boolean {
    return this.finished;
  }

  public result(): ChatResult {
    if (!this.finished) {
      return Result.fail(
        providerError("PROVIDER_BAD_RESPONSE", "Ollama closed the stream before done."),
      );
    }

    if (this.content === "") {
      return Result.fail(
        providerError("PROVIDER_BAD_RESPONSE", "Ollama answered without message.content."),
      );
    }

    return Result.ok(this.content);
  }
}

const errorNameSchema = z.object({ name: z.enum(["AbortError", "TimeoutError"]) });

const isAbort = (error: unknown): boolean => errorNameSchema.safeParse(error).success;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class OllamaProvider implements TranslationProvider {
  public readonly id = "ollama";
  public readonly model: string;

  public constructor(private readonly config: OllamaConfig) {
    this.model = config.model;
  }

  public async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    const { signal } = options;

    if (signal?.aborted) return Result.fail(requestCancelled());

    const controller = new AbortController();
    const idle = idleTimer(this.config.timeoutMs, () => controller.abort());
    const cancel = () => controller.abort();

    signal?.addEventListener("abort", cancel, { once: true });

    try {
      const result = await this.exchange(messages, options, idle, controller.signal);

      if (result.isFailure && signal?.aborted) return Result.fail(requestCancelled());

      return result;
    } finally {
      idle.clear();
      signal?.removeEventListener("abort", cancel);
    }
  }

  private async exchange(
    messages: ChatMessage[],
    options: ChatOptions,
    idle: IdleTimer,
    signal: AbortSignal,
  ): Promise<ChatResult> {
    const sent = await this.send(messages, options, signal);

    if (sent.isFailure) return Result.fail(sent.getError());

    idle.reset();

    return this.read(sent.getValue(), idle, signal, {
      onText: options.onText ?? (() => undefined),
      onStats: options.onStats ?? (() => undefined),
    });
  }

  private async send(
    messages: ChatMessage[],
    { contextTokens, maxOutputTokens }: ChatOptions,
    signal: AbortSignal,
  ): Promise<Result<Response, ProviderError>> {
    const { baseUrl, model, fetch } = this.config;
    const body = {
      model,
      messages,
      stream: true,
      keep_alive: `${KEEP_ALIVE_MS / 1000}s`,
      options: {
        temperature: 0,
        num_ctx: contextTokens,
        ...(maxOutputTokens === undefined ? {} : { num_predict: maxOutputTokens }),
      },
    };

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      return Result.ok(response);
    } catch (error) {
      return Result.fail(this.transportError(error));
    }
  }

  private async read(
    response: Response,
    idle: IdleTimer,
    signal: AbortSignal,
    listeners: StreamListeners,
  ): Promise<ChatResult> {
    const statusError = this.statusError(response.status);

    if (statusError) return Result.fail(statusError);

    if (response.body === null) {
      return Result.fail(providerError("PROVIDER_BAD_RESPONSE", "Ollama sent an empty body."));
    }

    const reader = response.body.getReader();

    try {
      const streamed = await this.accumulate(reader, idle, signal, listeners);

      if (!streamed.done) void reader.cancel().catch(() => undefined);

      return streamed.result;
    } catch (error) {
      void reader.cancel().catch(() => undefined);

      if (isAbort(error)) return Result.fail(this.timeoutError());

      return Result.fail(
        providerError(
          "PROVIDER_BAD_RESPONSE",
          `Ollama sent an unreadable body: ${reasonOf(error)}`,
        ),
      );
    }
  }

  private async accumulate(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    idle: IdleTimer,
    signal: AbortSignal,
    listeners: StreamListeners,
  ): Promise<{ result: ChatResult; done: boolean }> {
    const decoder = new TextDecoder();
    const chunks = new ChunkAccumulator(listeners);
    let buffer = "";

    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);

      idle.reset();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");

      buffer = done ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        const pushed = chunks.push(line);

        if (pushed.isFailure) return { result: Result.fail(pushed.getError()), done };
      }

      if (chunks.isDone() || done) return { result: chunks.result(), done };
    }
  }

  private statusError(status: number): ProviderError | undefined {
    const { forbiddenHint, model } = this.config;

    if (status === 403) {
      return providerError(
        "PROVIDER_FORBIDDEN_ORIGIN",
        `Ollama refused the origin ${forbiddenHint}. Run "sudo systemctl edit ollama", add Environment="OLLAMA_ORIGINS=${forbiddenHint}" under [Service], then run "sudo systemctl restart ollama".`,
      );
    }

    if (status === 404) {
      return providerError(
        "PROVIDER_MODEL_MISSING",
        `Model ${model} is not installed. Run "ollama pull ${model}".`,
      );
    }

    if (status < 200 || status >= 300) {
      return providerError("PROVIDER_BAD_RESPONSE", `Ollama answered with HTTP ${status}.`);
    }

    return undefined;
  }

  private transportError(error: unknown): ProviderError {
    if (isAbort(error)) return this.timeoutError();

    return providerError(
      "PROVIDER_UNREACHABLE",
      `Ollama is not reachable at ${this.config.baseUrl}. Start it with "ollama serve" or "sudo systemctl start ollama". (${reasonOf(error)})`,
    );
  }

  private timeoutError(): ProviderError {
    return providerError(
      "PROVIDER_TIMEOUT",
      `Ollama did not answer within ${this.config.timeoutMs} ms.`,
    );
  }
}
