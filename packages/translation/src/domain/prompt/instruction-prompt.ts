import { encodeBatch } from "../batch/batch-format";
import type { PageBrief } from "../page/page-brief";
import type { ChatMessage, PromptAdapter, PromptInput } from "./prompt-adapter";
import { JARGON_RULE, languageLabel, overheadTokensOf, TAG_RULE } from "./prompt-adapter";

function briefLines(brief: PageBrief): string[] {
  return [
    `Site: ${brief.host}`,
    `Title: ${brief.title}`,
    brief.description === "" ? "" : `Description: ${brief.description}`,
    brief.headings.length === 0 ? "" : `Headings: ${brief.headings.join(" | ")}`,
  ].filter((line) => line !== "");
}

function build({ source, target, brief, segments }: PromptInput): ChatMessage[] {
  const to = languageLabel(target);
  const from = source
    .map((language) => languageLabel(language).label)
    .unwrapOr("the page's language");

  const system = [
    `You translate segments of a web page from ${from} into ${to.label}.`,
    "Page context:",
    ...briefLines(brief),
    "Infer the field of the page from this context.",
    JARGON_RULE,
    "Keep the tone, register and formatting of the source.",
    TAG_RULE,
    'Return exactly the segments you received, one <seg n="N">...</seg> line each, with the same numbers, and nothing else.',
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `Translate these segments:\n\n${encodeBatch(segments)}` },
  ];
}

export const instructionPrompt: PromptAdapter = {
  build,
  overheadTokens: (input) => overheadTokensOf(build, input),
};
