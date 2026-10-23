import { Result } from "@lambe/kernel/result";
import { z } from "zod";
import type { ModelCatalog } from "../../application/ports/model-catalog";
import type {
  ChatOptions,
  GenerationStats,
  TranslationProvider,
} from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type ProviderError, providerError } from "../../domain/provider/provider-error";
import {
  type ChatResult,
  type FetchFn,
  fetchJson,
  jsonOf,
  type LineDecoder,
  type ProviderFailures,
  type StreamListeners,
  streamChat,
} from "./stream-support";

export const KEEP_ALIVE_MS = 10 * 60_000;

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  fetch: FetchFn;
  timeoutMs: number;
  forbiddenHint: string;
}

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

const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });

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

function parseChunk(line: string): Result<ChatChunk, ProviderError> {
  const parsed = chatChunkSchema.safeParse(jsonOf(line));

  if (parsed.success) return Result.ok(parsed.data);

  return Result.fail(
    providerError("PROVIDER_BAD_RESPONSE", "Ollama streamed a line that is not a chat chunk."),
  );
}

class ChunkAccumulator implements LineDecoder {
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

function ollamaFailures({
  baseUrl,
  model,
  timeoutMs,
  forbiddenHint,
}: OllamaConfig): ProviderFailures {
  return {
    name: "Ollama",
    refused(status) {
      if (status !== 403) return undefined;

      return providerError(
        "PROVIDER_FORBIDDEN_ORIGIN",
        `Ollama refused the origin ${forbiddenHint}. Run "sudo systemctl edit ollama", add Environment="OLLAMA_ORIGINS=${forbiddenHint}" under [Service], then run "sudo systemctl restart ollama".`,
        { origin: forbiddenHint },
      );
    },
    modelMissing() {
      return providerError(
        "PROVIDER_MODEL_MISSING",
        `Model ${model} is not installed. Run "ollama pull ${model}".`,
        { model },
      );
    },
    unreachable(reason) {
      return providerError(
        "PROVIDER_UNREACHABLE",
        `Ollama is not reachable at ${baseUrl}. Start it with "ollama serve" or "sudo systemctl start ollama". (${reason})`,
        { baseUrl },
      );
    },
    timeout() {
      return providerError("PROVIDER_TIMEOUT", `Ollama did not answer within ${timeoutMs} ms.`, {
        timeoutMs: String(timeoutMs),
      });
    },
  };
}

export class OllamaProvider implements TranslationProvider, ModelCatalog {
  public readonly id = "ollama";
  public readonly model: string;
  private readonly failures: ProviderFailures;

  public constructor(private readonly config: OllamaConfig) {
    this.model = config.model;
    this.failures = ollamaFailures(config);
  }

  public chat(
    messages: ChatMessage[],
    { contextTokens, maxOutputTokens, onText, onStats, signal }: ChatOptions,
  ): Promise<ChatResult> {
    const body = {
      model: this.model,
      messages,
      stream: true,
      keep_alive: `${KEEP_ALIVE_MS / 60_000}m`,
      options: {
        temperature: 0,
        num_ctx: contextTokens,
        ...(maxOutputTokens === undefined ? {} : { num_predict: maxOutputTokens }),
      },
    };

    return streamChat({
      ...this.request("/api/chat", signal),
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      decoder: new ChunkAccumulator({
        onText: onText ?? (() => undefined),
        onStats: onStats ?? (() => undefined),
      }),
    });
  }

  public async listModels(signal?: AbortSignal): Promise<Result<string[], ProviderError>> {
    const tags = await fetchJson({
      ...this.request("/api/tags", signal),
      init: { method: "GET" },
      schema: tagsSchema,
    });

    return tags.map(({ models }) => models.map(({ name }) => name));
  }

  private request(path: string, signal: AbortSignal | undefined) {
    const { baseUrl, fetch, timeoutMs } = this.config;

    return {
      fetch,
      url: `${baseUrl.replace(/\/+$/, "")}${path}`,
      timeoutMs,
      signal,
      failures: this.failures,
    };
  }
}
