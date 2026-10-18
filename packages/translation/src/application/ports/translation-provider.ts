import type { Result } from "@lambe/kernel/result";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import type { ProviderError } from "../../domain/provider/provider-error";

export interface ChatOptions {
  contextTokens: number;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface TranslationProvider {
  readonly id: string;
  readonly model: string;
  chat(messages: ChatMessage[], options: ChatOptions): Promise<Result<string, ProviderError>>;
}
