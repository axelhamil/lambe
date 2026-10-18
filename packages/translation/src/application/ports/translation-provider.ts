import type { Result } from "@lambe/kernel/result";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import type { ProviderError } from "../../domain/provider/provider-error";

export interface TranslationProvider {
  readonly id: string;
  readonly model: string;
  chat(
    messages: ChatMessage[],
    options: { contextTokens: number },
  ): Promise<Result<string, ProviderError>>;
}
