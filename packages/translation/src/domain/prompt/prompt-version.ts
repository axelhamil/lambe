import type { ContentBrief } from "./prompt-adapter";

export const PROMPT_VERSION = "4";

export const CAPTION_PROMPT_VERSION = "c1";

export function promptVersionOf(brief: ContentBrief): string {
  return brief.kind === "captions" ? CAPTION_PROMPT_VERSION : PROMPT_VERSION;
}
