import type { Option } from "@lambe/kernel/option";
import type { BatchSegment } from "../batch/batch-format";
import { estimateTokens } from "../batch/budget";
import type { LanguageCode } from "../language/value-objects/language-code.vo";
import type { PageBrief } from "../page/page-brief";

export type ModelFamily = "translategemma" | "instruction";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface PromptInput {
  source: Option<LanguageCode>;
  target: LanguageCode;
  brief: PageBrief;
  segments: BatchSegment[];
}

export interface PromptAdapter {
  build(input: PromptInput): ChatMessage[];
  overheadTokens(input: Omit<PromptInput, "segments">): number;
}

export const TAG_RULE =
  'The text is a list of segments. Keep every <seg n="N"> wrapper and every <xN/> and <gN>...</gN> tag exactly as given, translate the text around and between them, and return every segment with its number. Never translate or change anything inside <xN/>. Keep non breaking spaces and HTML entities such as &amp; and &lt; as they are.';

export const JARGON_RULE =
  "Leave terms of art in their original form when professionals of the page's field use them that way in the target language, for example fork, pull request, merge, commit, branch and deploy in software.";

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

export function modelFamilyOf(model: string): ModelFamily {
  return model.startsWith("translategemma") ? "translategemma" : "instruction";
}

export function languageLabel(language: LanguageCode): { name: string; label: string } {
  const name = languageNames.of(language.value) ?? language.value;

  return { name, label: `${name} (${language.value})` };
}

export function overheadTokensOf(
  build: (input: PromptInput) => ChatMessage[],
  input: Omit<PromptInput, "segments">,
): number {
  const messages = build({ ...input, segments: [] });

  return estimateTokens(messages.map((message) => message.content).join(""));
}
