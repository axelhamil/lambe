import { describe, expect, test } from "bun:test";
import type { CaptionBrief } from "../caption/caption-brief";
import { LanguageCode } from "../language/value-objects/language-code.vo";
import { captionContextLines } from "./caption-context";

const french = LanguageCode.create("fr").getValue();

const brief: CaptionBrief = {
  kind: "captions",
  host: "www.youtube.com",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "How forks work",
  channel: "Git Weekly",
  description: "A short tour of forks.",
  generated: false,
  preceding: [],
};

describe("captionContextLines", () => {
  test("states_one_sentence_per_line_in_the_target_language", () => {
    expect(captionContextLines(brief, french)).toEqual([
      'Video: "How forks work" by Git Weekly on www.youtube.com.',
      "Description: A short tour of forks.",
      "Each line is one sentence of the video's spoken captions, in playback order. Translate every line on its own line as natural spoken French, short enough to read as a subtitle. Do not merge, split or reorder lines.",
    ]);
  });

  test("adds_the_speech_recognition_rule_only_for_generated", () => {
    const rule =
      "The captions come from speech recognition: punctuation and capitals may be missing and some words may be misheard. Translate the most likely meaning.";

    expect(captionContextLines({ ...brief, generated: true }, french)).toContain(rule);
    expect(captionContextLines(brief, french)).not.toContain(rule);
  });

  test("lists_preceding_lines_as_context_only", () => {
    const lines = captionContextLines(
      { ...brief, description: "", preceding: ["So you want a fork.", "Here is why."] },
      french,
    );

    expect(lines.at(-1)).toBe(
      "Previous lines, for context only, do not translate them: So you want a fork. / Here is why.",
    );
    expect(lines.some((line) => line.startsWith("Description:"))).toBe(false);
  });

  test("cuts_the_description_to_200_chars", () => {
    const lines = captionContextLines({ ...brief, description: "a".repeat(300) }, french);

    expect(lines[1]).toBe(`Description: ${"a".repeat(200)}`);
  });
});
