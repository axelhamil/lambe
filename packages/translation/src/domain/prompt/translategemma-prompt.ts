import { encodeBatch } from "../batch/batch-format";
import type { LanguageCode } from "../language/value-objects/language-code.vo";
import type { PageBrief } from "../page/page-brief";
import { captionContextLines } from "./caption-context";
import { guidelinesTextOf } from "./guidelines";
import type { ChatMessage, ContentBrief, PromptAdapter, PromptInput } from "./prompt-adapter";
import { languageLabel, overheadTokensOf, TAG_RULE } from "./prompt-adapter";

function contextLine(brief: PageBrief, guidelines: string): string {
  const headings = brief.headings.length > 0 ? ` Headings: ${brief.headings.join(" | ")}.` : "";

  return `Context: the text comes from ${brief.host}, page "${brief.title}".${headings} ${guidelinesTextOf(guidelines)}`;
}

const LINE_NUMBER_RULE =
  "Keep the [N] number at the start of every line and return every line on its own line with its number.";

function ruleLines(brief: ContentBrief, target: LanguageCode, guidelines: string): string[] {
  if (brief.kind === "captions") return [...captionContextLines(brief, target), LINE_NUMBER_RULE];

  return [contextLine(brief, guidelines), TAG_RULE];
}

function build({ source, target, brief, segments, guidelines }: PromptInput): ChatMessage[] {
  const to = languageLabel(target);
  const from = source.map(languageLabel);

  const opening = from
    .map(
      ({ name, label }) =>
        `You are a professional ${label} to ${to.label} translator. Your goal is to accurately convey the meaning and nuances of the original ${name} text while adhering to ${to.name} grammar, vocabulary, and cultural sensitivities.`,
    )
    .unwrapOr(
      `You are a professional translator into ${to.label}. Your goal is to accurately convey the meaning and nuances of the original text while adhering to ${to.name} grammar, vocabulary, and cultural sensitivities.`,
    );

  const sourceText = from.map(({ name }) => `${name} text`).unwrapOr("text");

  const request = `Produce only the ${to.name} translation, without any additional explanations or commentary. Please translate the following ${sourceText} into ${to.name}:`;

  const content = [
    opening,
    ...ruleLines(brief, target, guidelines),
    `${request}\n\n\n${encodeBatch(segments)}`,
  ].join("\n");

  return [{ role: "user", content }];
}

export const translateGemmaPrompt: PromptAdapter = {
  build,
  overheadTokens: (input) => overheadTokensOf(build, input),
};
