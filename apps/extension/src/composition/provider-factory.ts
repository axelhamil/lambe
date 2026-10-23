import type { Option } from "@lambe/kernel/option";
import {
  type OllamaConfig,
  OllamaProvider,
} from "@lambe/translation/infrastructure/providers/ollama-provider";
import { OpenAiCompatibleProvider } from "@lambe/translation/infrastructure/providers/openai-compatible-provider";
import type { ProviderSettings } from "../settings/settings";

export type ProviderTarget = Pick<ProviderSettings, "kind" | "baseUrl" | "model" | "timeoutMs">;

export interface ProviderEnv {
  fetch: OllamaConfig["fetch"];
  apiKey: Option<string>;
  origin: string;
  now: () => number;
}

export function providerFor(
  provider: ProviderTarget,
  env: ProviderEnv,
): OllamaProvider | OpenAiCompatibleProvider {
  const common = {
    baseUrl: provider.baseUrl,
    model: provider.model,
    fetch: env.fetch,
    timeoutMs: provider.timeoutMs,
  };

  if (provider.kind === "openai-compatible") {
    return new OpenAiCompatibleProvider({ ...common, apiKey: env.apiKey, now: env.now });
  }

  return new OllamaProvider({ ...common, origin: env.origin });
}
