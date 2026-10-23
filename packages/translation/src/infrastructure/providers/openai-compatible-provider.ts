import type { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { z } from "zod";
import type { ModelCatalog } from "../../application/ports/model-catalog";
import type {
  ChatOptions,
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

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey: Option<string>;
  fetch: FetchFn;
  timeoutMs: number;
  now: () => number;
}

const counter = z.number().nonnegative().default(0);

const streamEventSchema = z.union([
  z.object({ error: z.union([z.string(), z.object({ message: z.string() })]) }),
  z.object({
    choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }).default({}) })),
    usage: z.object({ prompt_tokens: counter, completion_tokens: counter }).nullish(),
  }),
]);

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

const DONE = "[DONE]";

const DATA_PREFIX = "data:";

const REDACTED = "[redacted]";

type StreamEvent = z.infer<typeof streamEventSchema>;

function parseEvent(payload: string): Result<StreamEvent, ProviderError> {
  const parsed = streamEventSchema.safeParse(jsonOf(payload));

  if (parsed.success) return Result.ok(parsed.data);

  return Result.fail(
    providerError(
      "PROVIDER_BAD_RESPONSE",
      "The provider streamed an event that is not a chat chunk.",
    ),
  );
}

class SseAccumulator implements LineDecoder {
  private content = "";
  private finished = false;
  private promptTokens = 0;
  private outputTokens = 0;

  public constructor(
    private readonly listeners: StreamListeners,
    private readonly elapsedMs: () => number,
  ) {}

  public push(line: string): Result<void, ProviderError> {
    const trimmed = line.trim();

    if (this.finished || !trimmed.startsWith(DATA_PREFIX)) return Result.ok();

    const payload = trimmed.slice(DATA_PREFIX.length).trim();

    if (payload === DONE) return Result.ok(this.finish());

    return parseEvent(payload).flatMap((event): Result<void, ProviderError> => {
      if ("error" in event) {
        const detail = typeof event.error === "string" ? event.error : event.error.message;

        return Result.fail(
          providerError("PROVIDER_BAD_RESPONSE", `The provider reported an error: ${detail}`),
        );
      }

      for (const choice of event.choices) this.append(choice.delta.content ?? "");

      if (event.usage) {
        this.promptTokens = event.usage.prompt_tokens;
        this.outputTokens = event.usage.completion_tokens;
      }

      return Result.ok();
    });
  }

  public isDone(): boolean {
    return this.finished;
  }

  public result(): ChatResult {
    if (!this.finished) {
      return Result.fail(
        providerError("PROVIDER_BAD_RESPONSE", `The provider closed the stream before ${DONE}.`),
      );
    }

    if (this.content === "") {
      return Result.fail(
        providerError("PROVIDER_BAD_RESPONSE", "The provider answered without any content."),
      );
    }

    return Result.ok(this.content);
  }

  private append(delta: string): void {
    if (delta === "") return;

    this.content += delta;
    this.listeners.onText(delta);
  }

  private finish(): void {
    this.finished = true;
    this.listeners.onStats({
      loadMs: 0,
      promptTokens: this.promptTokens,
      promptMs: 0,
      outputTokens: this.outputTokens,
      outputMs: 0,
      totalMs: this.elapsedMs(),
    });
  }
}

const apiRootOf = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`;

function openAiFailures(baseUrl: string, model: string, timeoutMs: number): ProviderFailures {
  return {
    name: "The provider",
    refused(status) {
      if (status !== 401 && status !== 403) return undefined;

      return providerError(
        "PROVIDER_UNAUTHORIZED",
        `The provider at ${baseUrl} refused the request (HTTP ${status}). Check the API key.`,
        { baseUrl },
      );
    },
    modelMissing() {
      return providerError(
        "PROVIDER_MODEL_MISSING",
        `Model ${model} is not available at ${baseUrl}.`,
        { model },
      );
    },
    unreachable(reason) {
      return providerError(
        "PROVIDER_UNREACHABLE",
        `The provider is not reachable at ${baseUrl}. (${reason})`,
        { baseUrl },
      );
    },
    timeout() {
      return providerError(
        "PROVIDER_TIMEOUT",
        `The provider did not answer within ${timeoutMs} ms.`,
        { timeoutMs: String(timeoutMs) },
      );
    },
  };
}

export class OpenAiCompatibleProvider implements TranslationProvider, ModelCatalog {
  public readonly id = "openai-compatible";
  public readonly model: string;
  private readonly failures: ProviderFailures;
  private readonly apiKey: Option<string>;

  public constructor(private readonly config: OpenAiCompatibleConfig) {
    this.model = config.model;
    this.failures = openAiFailures(config.baseUrl, config.model, config.timeoutMs);
    this.apiKey = config.apiKey.filter((key) => key !== "");
  }

  public async chat(
    messages: ChatMessage[],
    { maxOutputTokens, onText, onStats, signal }: ChatOptions,
  ): Promise<ChatResult> {
    const { now } = this.config;
    const startedAt = now();
    const body = {
      model: this.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0,
      ...(maxOutputTokens === undefined ? {} : { max_tokens: maxOutputTokens }),
    };

    const result = await streamChat({
      ...this.request("/chat/completions", signal),
      init: { method: "POST", headers: this.headers(), body: JSON.stringify(body) },
      decoder: new SseAccumulator(
        { onText: onText ?? (() => undefined), onStats: onStats ?? (() => undefined) },
        () => now() - startedAt,
      ),
    });

    return result.mapError((error) => this.redacted(error));
  }

  public async listModels(signal?: AbortSignal): Promise<Result<string[], ProviderError>> {
    const listed = await fetchJson({
      ...this.request("/models", signal),
      init: { method: "GET", headers: this.headers() },
      schema: modelsSchema,
    });

    return listed
      .map(({ data }) => data.map(({ id }) => id))
      .mapError((error) => this.redacted(error));
  }

  private request(path: string, signal: AbortSignal | undefined) {
    const { baseUrl, fetch, timeoutMs } = this.config;

    return {
      fetch,
      url: `${apiRootOf(baseUrl)}${path}`,
      timeoutMs,
      signal,
      failures: this.failures,
    };
  }

  private headers(): Record<string, string> {
    const json: Record<string, string> = { "content-type": "application/json" };

    return this.apiKey
      .map((key): Record<string, string> => ({ ...json, authorization: `Bearer ${key}` }))
      .unwrapOr(json);
  }

  private redacted(error: ProviderError): ProviderError {
    return this.apiKey
      .map((key) => {
        const hide = (text: string) => text.replaceAll(key, REDACTED);
        const params =
          error.params &&
          Object.fromEntries(
            Object.entries(error.params).map(([name, value]) => [name, hide(value)]),
          );

        return providerError(error.code, hide(error.message), params);
      })
      .unwrapOr(error);
  }
}
