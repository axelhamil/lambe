import type { CaptionBrief } from "../caption/caption-brief";
import type { LanguageCode } from "../language/value-objects/language-code.vo";
import { languageLabel } from "./prompt-adapter";

const DESCRIPTION_LIMIT = 200;

const SPEECH_RECOGNITION_RULE =
  "The captions come from speech recognition: punctuation and capitals may be missing and some words may be misheard. Translate the most likely meaning.";

export function captionContextLines(brief: CaptionBrief, target: LanguageCode): string[] {
  const description = brief.description.slice(0, DESCRIPTION_LIMIT);

  return [
    `Video: "${brief.title}" by ${brief.channel} on ${brief.host}.`,
    description === "" ? "" : `Description: ${description}`,
    `Each line is one sentence of the video's spoken captions, in playback order. Translate every line on its own line as natural spoken ${languageLabel(target).name}, short enough to read as a subtitle. Do not merge, split or reorder lines.`,
    brief.generated ? SPEECH_RECOGNITION_RULE : "",
    brief.preceding.length === 0
      ? ""
      : `Previous lines, for context only, do not translate them: ${brief.preceding.join(" / ")}`,
  ].filter((line) => line !== "");
}
