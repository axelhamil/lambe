import { encodeBatch } from "../batch/batch-format";
import type { LanguageCode } from "../language/value-objects/language-code.vo";
import type { PageBrief } from "../page/page-brief";
import { captionContextLines } from "./caption-context";
import type { ChatMessage, ContentBrief, PromptAdapter, PromptInput } from "./prompt-adapter";
import { JARGON_RULE, languageLabel, overheadTokensOf, TAG_RULE } from "./prompt-adapter";

function contextLine(brief: PageBrief): string {
  const headings = brief.headings.length > 0 ? ` Headings: ${brief.headings.join(" | ")}.` : "";

  return `Context: the text comes from ${brief.host}, page "${brief.title}".${headings} ${JARGON_RULE}`;
}

function contextLines(brief: ContentBrief, target: LanguageCode): string[] {
  return brief.kind === "captions" ? captionContextLines(brief, target) : [contextLine(brief)];
}

function build({ source, target, brief, segments }: PromptInput): ChatMessage[] {
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
    ...contextLines(brief, target),
    TAG_RULE,
    `${request}\n\n\n${encodeBatch(segments)}`,
  ].join("\n");

  return [{ role: "user", content }];
}

export const translateGemmaPrompt: PromptAdapter = {
  build,
  overheadTokens: (input) => overheadTokensOf(build, input),
};
