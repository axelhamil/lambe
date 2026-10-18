import { Result } from "@lambe/kernel/result";
import { z } from "zod";
import type { TranslationProvider } from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type ProviderError, providerError } from "../../domain/provider/provider-error";

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  fetch: FetchFn;
  timeoutMs: number;
  forbiddenHint: string;
}

type ChatResult = Result<string, ProviderError>;

const chatResponseSchema = z.object({ message: z.object({ content: z.string().min(1) }) });

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

  public async chat(
    messages: ChatMessage[],
    options: { contextTokens: number },
  ): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const sent = await this.send(messages, options.contextTokens, controller.signal);

      if (sent.isFailure) return Result.fail(sent.getError());

      return await this.read(sent.getValue());
    } finally {
      clearTimeout(timer);
    }
  }

  private async send(
    messages: ChatMessage[],
    contextTokens: number,
    signal: AbortSignal,
  ): Promise<Result<Response, ProviderError>> {
    const { baseUrl, model, fetch } = this.config;
    const body = {
      model,
      messages,
      stream: false,
      keep_alive: "10m",
      options: { temperature: 0, num_ctx: contextTokens },
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

  private async read(response: Response): Promise<ChatResult> {
    const statusError = this.statusError(response.status);

    if (statusError) return Result.fail(statusError);

    try {
      const parsed = chatResponseSchema.safeParse(await response.json());

      if (!parsed.success) {
        return Result.fail(
          providerError("PROVIDER_BAD_RESPONSE", "Ollama answered without message.content."),
        );
      }

      return Result.ok(parsed.data.message.content);
    } catch (error) {
      if (isAbort(error)) return Result.fail(this.timeoutError());

      return Result.fail(
        providerError(
          "PROVIDER_BAD_RESPONSE",
          `Ollama sent an unreadable body: ${reasonOf(error)}`,
        ),
      );
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
