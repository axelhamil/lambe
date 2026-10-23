import type { ContentBrief } from "./prompt-adapter";

export const PROMPT_VERSION = "4";

export const CAPTION_PROMPT_VERSION = "c1";

export function promptVersionOf(brief: ContentBrief, guidelinesId: string): string {
  if (brief.kind === "captions") return CAPTION_PROMPT_VERSION;

  if (guidelinesId === "") return PROMPT_VERSION;

  return `${PROMPT_VERSION}+${guidelinesId}`;
}
