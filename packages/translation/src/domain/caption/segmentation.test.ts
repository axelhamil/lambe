import { describe, expect, test } from "bun:test";
import { LanguageCode } from "../language/value-objects/language-code.vo";
import type { CaptionTrack, TimedText } from "./caption-track";
import { segmentSentences } from "./segmentation";
import { VideoId } from "./value-objects/video-id.vo";

const videoId = VideoId.create("dQw4w9WgXcQ").getValue();

function spoken(text: string, startMs: number, msPerWord = 300): TimedText[] {
  return text.split(" ").map((word, index) => ({
    text: word,
    startMs: startMs + index * msPerWord,
    endMs: startMs + (index + 1) * msPerWord,
  }));
}

function at(text: string, startMs: number, endMs = startMs): TimedText {
  return { text, startMs, endMs };
}

function generated(units: TimedText[], language = "en"): CaptionTrack {
  return {
    videoId,
    language: LanguageCode.create(language).getValue(),
    generated: true,
    units,
  };
}

function textsOf(track: CaptionTrack): string[] {
  return segmentSentences(track).map((sentence) => sentence.text);
}

function lastEnd(words: TimedText[]): number {
  return words.at(-1)?.endMs ?? 0;
}

describe("segmentSentences", () => {
  test("drops_blank_words_and_breaks_on_speaker_marks", () => {
    const track = generated([
      ...spoken("hello there my friend", 0),
      at(" ", 1200),
      at(">>", 1200),
      ...spoken("yes indeed that is right", 1200),
    ]);

    expect(textsOf(track)).toEqual(["hello there my friend", "yes indeed that is right"]);
  });

  test("bracketed_sound_is_its_own_sentence", () => {
    const track = generated([
      at("[Music]", 0, 300),
      ...spoken("welcome back to the channel", 300),
      at("[upbeat", 1800, 2100),
      at("music]", 2100, 2400),
      ...spoken("today we cook pasta together", 2400),
    ]);

    expect(textsOf(track)).toEqual([
      "[Music]",
      "welcome back to the channel",
      "[upbeat music]",
      "today we cook pasta together",
    ]);
  });

  test("punctuated_track_breaks_after_terminal_marks", () => {
    const track = generated([
      ...spoken("This is a", 0),
      ...spoken("great day.", 2500),
      ...spoken("Do you agree with me? I really think so too!", 3100),
    ]);

    expect(textsOf(track)).toEqual([
      "This is a great day.",
      "Do you agree with me?",
      "I really think so too!",
    ]);
  });

  test("abbreviations_and_numbers_do_not_break", () => {
    const track = generated(
      spoken(
        "We met Dr. Smith in the hall. He lives at no 42. Main street today. It was a nice visit.",
        0,
      ),
    );

    expect(textsOf(track)).toEqual([
      "We met Dr. Smith in the hall.",
      "He lives at no 42. Main street today.",
      "It was a nice visit.",
    ]);
  });

  test("unpunctuated_track_breaks_on_pauses_over_one_second", () => {
    const first = spoken("we went to the market", 0);
    const second = spoken("we bought some fresh bread", lastEnd(first) + 1001);
    const third = spoken("it was very good indeed", lastEnd(second) + 1000);

    expect(textsOf(generated([...first, ...second, ...third]))).toEqual([
      "we went to the market",
      "we bought some fresh bread it was very good indeed",
    ]);
  });

  test("breaks_before_a_break_word_after_300_ms", () => {
    expect(textsOf(generated(spoken("the weather was nice but it rained later today", 0)))).toEqual(
      ["the weather was nice", "but it rained later today"],
    );
    expect(textsOf(generated(spoken("the food was cold i mean really cold", 0)))).toEqual([
      "the food was cold",
      "i mean really cold",
    ]);
    expect(textsOf(generated(spoken("yes but the shop was closed", 0, 100)))).toEqual([
      "yes but the shop was closed",
    ]);
  });

  test("unpunctuated_monologue_never_exceeds_twenty_words", () => {
    const monologue = Array.from({ length: 95 }, (_, index) => `word${index}`).join(" ");
    const sentences = textsOf(generated(spoken(monologue, 0)));

    expect(sentences.every((text) => text.split(" ").length <= 20)).toBe(true);
    expect(sentences.join(" ")).toBe(monologue);

    const opening = spoken("one two three four five six seven eight", 0);
    const rest = spoken(
      "nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive",
      lastEnd(opening) + 600,
    );

    expect(textsOf(generated([...opening, ...rest]))[0]).toBe(
      "one two three four five six seven eight",
    );
  });

  test("cue_level_units_are_capped_by_real_words_and_break_inside_a_cue", () => {
    const cues = Array.from({ length: 5 }, (_, index) =>
      at(`cue${index} brings eight words of steady talk here`, index * 2400, index * 2400 + 2400),
    );
    const monologue = cues.map((unit) => unit.text).join(" ");
    const sentences = textsOf(generated(cues));

    expect(sentences.every((text) => text.split(" ").length <= 20)).toBe(true);
    expect(sentences.join(" ")).toBe(monologue);

    const punctuated = generated([
      at("It rained all day. We stayed at home.", 0, 3000),
      at("The old roof held. Nobody got wet at all.", 3000, 6000),
    ]);

    expect(textsOf(punctuated)).toEqual([
      "It rained all day.",
      "We stayed at home.",
      "The old roof held.",
      "Nobody got wet at all.",
    ]);
    expect(segmentSentences(punctuated).map(({ startMs }) => startMs)).toEqual([
      0, 1500, 3000, 4364,
    ]);
  });

  test("short_fragment_joins_its_neighbour_within_limits", () => {
    const sentence = "we went to the market";
    const other = "the shop was closed again";
    const track = (beforeGap: number, afterGap: number, opening = sentence) => {
      const first = spoken(opening, 0);
      const fragment = spoken("right", lastEnd(first) + beforeGap);
      const last = spoken(other, lastEnd(fragment) + afterGap);

      return generated([...first, ...fragment, ...last]);
    };
    const long = Array.from({ length: 20 }, (_, index) => `word${index}`).join(" ");

    expect(textsOf(track(1200, 2000))).toEqual([`${sentence} right`, other]);
    expect(textsOf(track(2000, 1200))).toEqual([sentence, `right ${other}`]);
    expect(textsOf(track(2000, 2000))).toEqual([sentence, "right", other]);
    expect(textsOf(track(1200, 2000, long))).toEqual([long, "right", other]);
  });

  test("end_is_capped_by_the_next_start_and_lasts_at_least_one_second", () => {
    const first = [...spoken("we went to the", 0), at("market", 1200, 2600)];
    const second = spoken("hello there my friend", 2400, 100);
    const third = spoken("okay see you soon", 3000, 100);
    const sentences = segmentSentences(
      generated([...first, at(">>", 2400), ...second, at(">>", 3000), ...third]),
    );

    expect(sentences.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [0, 2400],
      [2400, 3000],
      [3000, 4000],
    ]);
  });

  test("manual_track_keeps_one_sentence_per_cue", () => {
    const sentences = segmentSentences({
      videoId,
      language: LanguageCode.create("en").getValue(),
      generated: false,
      units: [at("Hello\nworld", 0, 1500), at("  ", 1500, 1600), at("Short", 1600, 1700)],
    });

    expect(
      sentences.map(({ id, index, text, startMs, endMs }) => [
        id.value,
        index,
        text,
        startMs,
        endMs,
      ]),
    ).toEqual([
      ["dQw4w9WgXcQ:0", 0, "Hello world", 0, 1500],
      ["dQw4w9WgXcQ:1", 1, "Short", 1600, 1700],
    ]);
  });

  test("segmentation_keeps_every_word_in_order", () => {
    const words = Array.from({ length: 60 }, (_, index) =>
      index % 7 === 0 ? `and${index}` : `w${index}`,
    );
    const units: TimedText[] = [];
    let clock = 0;

    words.forEach((word, index) => {
      if (index % 11 === 0) units.push(at(">>", clock));

      if (index % 13 === 0) units.push(at("  ", clock));

      if (index === 30) units.push(at("[Music]", clock, clock + 300));

      units.push(at(word, clock, clock + 250));
      clock += index % 9 === 0 ? 1400 : 250;
    });
    const expected = units
      .map((unit) => unit.text)
      .filter((text) => text.trim() !== "" && text !== ">>");
    const sentences = textsOf(generated(units));

    expect(sentences.flatMap((text) => text.split(" "))).toEqual(expected);
  });

  test("french_rules_apply_to_a_fr_track", () => {
    const words = spoken("nous sommes allés au marché parce que il faisait beau", 0);

    expect(textsOf(generated(words, "fr"))).toEqual([
      "nous sommes allés au marché",
      "parce que il faisait beau",
    ]);
    expect(textsOf(generated(words, "en"))).toEqual([
      "nous sommes allés au marché parce que il faisait beau",
    ]);
  });
});
