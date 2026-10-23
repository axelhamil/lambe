import {
  DEFAULT_GUIDELINES,
  guidelinesIdOf,
  guidelinesTextOf,
} from "@lambe/translation/domain/prompt/guidelines";
import { PROMPT_VERSION } from "@lambe/translation/domain/prompt/prompt-version";
import type { Saved, SettingsAccess } from "./settings-access";

interface GuidelinesHasher {
  sha256Hex(input: string): Promise<string>;
}

interface PromptModelDeps extends SettingsAccess {
  hasher: GuidelinesHasher;
}

export interface PromptVersion {
  prompt: string;
  guidelinesId: string;
}

function storedGuidelinesOf(text: string): string {
  const trimmed = text.trim();

  return trimmed === DEFAULT_GUIDELINES ? "" : trimmed;
}

export function promptModel({ settings, update, hasher }: PromptModelDeps) {
  const store = (prompt: string): Promise<Saved> => update((current) => ({ ...current, prompt }));

  return {
    text: (): string => guidelinesTextOf(settings.prompt),
    isCustom: (): boolean => settings.prompt !== "",
    hasChanges: (draft: string): boolean => storedGuidelinesOf(draft) !== settings.prompt,
    version: async (): Promise<PromptVersion> => ({
      prompt: PROMPT_VERSION,
      guidelinesId: await guidelinesIdOf(settings.prompt, hasher),
    }),
    save: (text: string): Promise<Saved> => store(storedGuidelinesOf(text)),
    reset: (): Promise<Saved> => store(""),
  };
}
