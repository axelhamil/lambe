import { instructionPrompt } from "./instruction-prompt";
import { type ModelFamily, modelFamilyOf, type PromptAdapter } from "./prompt-adapter";
import { translateGemmaPrompt } from "./translategemma-prompt";

export interface ModelProfile {
  prompt: PromptAdapter;
  contextTokens: number;
}

const PROFILES: Record<ModelFamily, ModelProfile> = {
  translategemma: { prompt: translateGemmaPrompt, contextTokens: 2048 },
  instruction: { prompt: instructionPrompt, contextTokens: 8192 },
};

export function modelProfileOf(model: string): ModelProfile {
  return PROFILES[modelFamilyOf(model)];
}
