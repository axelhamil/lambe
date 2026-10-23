import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { ProviderCapacity } from "../../application/ports/provider-capacity";
import type {
  ChatOptions,
  GenerationStats,
  TranslationProvider,
} from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type ProviderError, providerError } from "../../domain/provider/provider-error";

export interface AdaptiveConcurrencyOptions {
  maxConcurrency: number;
  forgetAfterIdleMs: number;
  now: () => number;
  onStats?: (stats: GenerationStats) => void;
}

const PIPELINE_AHEAD = 1;

export class AdaptiveConcurrencyProvider implements TranslationProvider, ProviderCapacity {
  public readonly id: string;
  public readonly model: string;
  private slots = 1;
  private active = 0;
  private lastSettled: number | undefined;
  private readonly waiting: Array<() => void> = [];
  private readonly streaming = new Set<symbol>();

  public constructor(
    private readonly inner: TranslationProvider,
    private readonly options: AdaptiveConcurrencyOptions,
  ) {
    const { maxConcurrency } = options;

    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError(`Concurrency limit must be a positive integer, got ${maxConcurrency}.`);
    }

    this.id = inner.id;
    this.model = inner.model;
  }

  public concurrency(): Option<number> {
    return Option.some(this.slots);
  }

  public async chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<Result<string, ProviderError>> {
    await this.acquire();

    const call = Symbol("chat");

    try {
      return await this.inner.chat(messages, {
        ...options,
        onText: (delta) => {
          this.streamed(call);
          options.onText?.(delta);
        },
        onStats: (stats) => {
          this.options.onStats?.(stats);
          options.onStats?.(stats);
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return Result.fail(
        providerError("PROVIDER_UNREACHABLE", `The provider call failed: ${reason}`),
      );
    } finally {
      this.streaming.delete(call);
      this.release();
    }
  }

  private limit(): number {
    return this.slots + PIPELINE_AHEAD;
  }

  private streamed(call: symbol): void {
    if (this.streaming.has(call)) return;

    this.streaming.add(call);

    if (this.streaming.size <= this.slots) return;

    this.slots = Math.min(this.options.maxConcurrency, this.streaming.size);
    this.wake();
  }

  private acquire(): Promise<void> {
    this.forgetIfIdle();

    if (this.active < this.limit()) {
      this.active += 1;

      return Promise.resolve();
    }

    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    this.active -= 1;
    this.lastSettled = this.options.now();
    this.wake();
  }

  private wake(): void {
    while (this.active < this.limit()) {
      const next = this.waiting.shift();

      if (next === undefined) return;

      this.active += 1;
      next();
    }
  }

  private forgetIfIdle(): void {
    const { lastSettled } = this;

    if (this.active > 0 || lastSettled === undefined) return;

    if (this.options.now() - lastSettled >= this.options.forgetAfterIdleMs) this.slots = 1;
  }
}
