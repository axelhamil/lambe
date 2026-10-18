import { Result } from "@lambe/kernel/result";
import type { TranslationProvider } from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type ProviderError, providerError } from "../../domain/provider/provider-error";

export class ConcurrencyLimitedProvider implements TranslationProvider {
  public readonly id: string;
  public readonly model: string;
  private readonly limit: number;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(
    private readonly inner: TranslationProvider,
    limit: number,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`Concurrency limit must be a positive integer, got ${limit}.`);
    }

    this.id = inner.id;
    this.model = inner.model;
    this.limit = limit;
  }

  public async chat(
    messages: ChatMessage[],
    options: { contextTokens: number },
  ): Promise<Result<string, ProviderError>> {
    await this.acquire();

    try {
      return await this.inner.chat(messages, options);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return Result.fail(
        providerError("PROVIDER_UNREACHABLE", `The provider call failed: ${reason}`),
      );
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;

      return Promise.resolve();
    }

    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();

    if (next) {
      next();

      return;
    }

    this.active -= 1;
  }
}
