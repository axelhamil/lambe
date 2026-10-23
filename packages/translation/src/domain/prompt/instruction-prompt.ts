import { encodeBatch } from "../batch/batch-format";
import type { LanguageCode } from "../language/value-objects/language-code.vo";
import type { PageBrief } from "../page/page-brief";
import { captionContextLines } from "./caption-context";
import type { ChatMessage, ContentBrief, PromptAdapter, PromptInput } from "./prompt-adapter";
import { JARGON_RULE, languageLabel, overheadTokensOf, TAG_RULE } from "./prompt-adapter";

const TONE_RULE = "Keep the tone, register and formatting of the source.";

function briefLines(brief: PageBrief): string[] {
  return [
    `Site: ${brief.host}`,
    `Title: ${brief.title}`,
    brief.description === "" ? "" : `Description: ${brief.description}`,
    brief.headings.length === 0 ? "" : `Headings: ${brief.headings.join(" | ")}`,
  ].filter((line) => line !== "");
}

function ruleLines(brief: ContentBrief, target: LanguageCode): string[] {
  if (brief.kind === "captions") return [...captionContextLines(brief, target), TONE_RULE];

  return [
    "Page context:",
    ...briefLines(brief),
    "Infer the field of the page from this context.",
    JARGON_RULE,
    TONE_RULE,
    TAG_RULE,
  ];
}

const SUBJECTS = {
  page: { content: "a web page", language: "the page's language" },
  captions: { content: "a video's captions", language: "the video's language" },
} satisfies Record<ContentBrief["kind"], { content: string; language: string }>;

function build({ source, target, brief, segments }: PromptInput): ChatMessage[] {
  const to = languageLabel(target);
  const subject = SUBJECTS[brief.kind];
  const from = source.map((language) => languageLabel(language).label).unwrapOr(subject.language);

  const system = [
    `You translate segments of ${subject.content} from ${from} into ${to.label}.`,
    ...ruleLines(brief, target),
    "Return exactly the segments you received, one [N] line each, with the same numbers, and nothing else.",
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
