import type { Result } from "@lambe/kernel/result";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import type { ProviderError } from "../../domain/provider/provider-error";

export interface GenerationStats {
  loadMs: number;
  promptTokens: number;
  promptMs: number;
  outputTokens: number;
  outputMs: number;
  totalMs: number;
}

export interface ChatOptions {
  contextTokens: number;
  maxOutputTokens?: number;
  onText?: (delta: string) => void;
  onStats?: (stats: GenerationStats) => void;
  signal?: AbortSignal;
}

export interface TranslationProvider {
  readonly id: string;
  readonly model: string;
  chat(messages: ChatMessage[], options: ChatOptions): Promise<Result<string, ProviderError>>;
}
