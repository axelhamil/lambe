import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { CaptionTrack } from "../../domain/caption/caption-track";
import { parseTimedtext, type TimedtextErrorCode } from "./json3-track";

const fixture = (name: string): Promise<string> =>
  readFile(new URL(`../../../fixtures/youtube/${name}`, import.meta.url), "utf8");

const timedtextUrl = (params: Record<string, string>): string =>
  `https://www.youtube.com/api/timedtext?${new URLSearchParams(params).toString()}`;

const MANUAL_EN = timedtextUrl({ v: "iG9CE55wbtY", lang: "en", fmt: "json3" });

const ASR_EN = timedtextUrl({ v: "iG9CE55wbtY", lang: "en", kind: "asr", fmt: "json3" });

const ASR_FR = timedtextUrl({ v: "8g5Aif1khO8", lang: "fr", kind: "asr", fmt: "json3" });

const parsedTrack = (url: string, body: string): CaptionTrack =>
  parseTimedtext({ url, body }).getValue();

const errorCodeOf = (url: string, body: string): TimedtextErrorCode =>
  parseTimedtext({ url, body }).getError().code;

describe("parseTimedtext", () => {
  test("manual_fixture_gives_one_unit_per_cue", async () => {
    const track = parsedTrack(MANUAL_EN, await fixture("manual-en.json3.json"));

    expect(track.videoId.value).toBe("iG9CE55wbtY");
    expect(track.language.value).toBe("en");
    expect(track.generated).toBe(false);
    expect(track.units).toHaveLength(23);
    expect(track.units[0]).toEqual({
      text: "Good morning. How are you?",
      startMs: 27103,
      endMs: 29678,
    });
    expect(track.units[6]?.text).toBe(
      "There have been three themes running through the conference,",
    );
  });

  test("asr_fixture_gives_timed_words_in_order", async () => {
    const track = parsedTrack(ASR_EN, await fixture("asr-en.json3.json"));
    const words = track.units.map((unit) => unit.text);

    expect(track.generated).toBe(true);
    expect(words.slice(0, 5)).toEqual(["[Music]", "good", "morning", "how", "are"]);
    expect(track.units[1]).toEqual({ text: "good", startMs: 26560, endMs: 26720 });
    expect(track.units[2]).toEqual({ text: "morning", startMs: 26720, endMs: 28400 });

    track.units.forEach((unit, index) => {
      const next = track.units[index + 1];

      expect(unit.endMs).toBeGreaterThanOrEqual(unit.startMs);

      if (next) expect(unit.endMs).toBe(next.startMs);
    });

    const last = track.units.at(-1);

    expect(last).toEqual({ text: "this", startMs: 68240, endMs: 69760 });
  });

  test("newline_appends_are_not_words", async () => {
    const english = parsedTrack(ASR_EN, await fixture("asr-en.json3.json"));
    const french = parsedTrack(ASR_FR, await fixture("asr-fr.json3.json"));
    const units = [...english.units, ...french.units];

    expect(english.units).toHaveLength(110);
    expect(french.units).toHaveLength(175);
    expect(french.language.value).toBe("fr");
    expect(units.every((unit) => unit.text.trim() === unit.text && unit.text.length > 0)).toBe(
      true,
    );
  });

  test("tlang_sets_the_track_language", async () => {
    const body = await fixture("asr-en.json3.json");
    const translated = timedtextUrl({
      v: "iG9CE55wbtY",
      lang: "en",
      kind: "asr",
      tlang: "fr",
      fmt: "json3",
    });

    const track = parsedTrack(translated, body);

    expect(track.language.value).toBe("fr");
    expect(track.generated).toBe(false);
  });

  test("non_json3_format_is_rejected", async () => {
    const body = await fixture("manual-en.json3.json");

    expect(errorCodeOf(timedtextUrl({ v: "iG9CE55wbtY", lang: "en", fmt: "srv3" }), body)).toBe(
      "TIMEDTEXT_NOT_JSON3",
    );
    expect(errorCodeOf(timedtextUrl({ v: "iG9CE55wbtY", lang: "en" }), body)).toBe(
      "TIMEDTEXT_NOT_JSON3",
    );
  });

  test("missing_video_or_language_is_rejected", async () => {
    const body = await fixture("manual-en.json3.json");

    expect(errorCodeOf(timedtextUrl({ lang: "en", fmt: "json3" }), body)).toBe(
      "TIMEDTEXT_NO_VIDEO",
    );
    expect(errorCodeOf(timedtextUrl({ v: "short", lang: "en", fmt: "json3" }), body)).toBe(
      "TIMEDTEXT_NO_VIDEO",
    );
    expect(errorCodeOf(timedtextUrl({ v: "iG9CE55wbtY", fmt: "json3" }), body)).toBe(
      "TIMEDTEXT_NO_LANGUAGE",
    );
    expect(errorCodeOf(timedtextUrl({ v: "iG9CE55wbtY", lang: "?", fmt: "json3" }), body)).toBe(
      "TIMEDTEXT_NO_LANGUAGE",
    );
  });

  test("malformed_body_is_rejected", () => {
    expect(errorCodeOf(MANUAL_EN, "<transcript/>")).toBe("TIMEDTEXT_MALFORMED");
    expect(errorCodeOf(MANUAL_EN, JSON.stringify({ events: "none" }))).toBe("TIMEDTEXT_MALFORMED");
    expect(errorCodeOf(MANUAL_EN, JSON.stringify({ events: [{ segs: [] }] }))).toBe(
      "TIMEDTEXT_MALFORMED",
    );
  });

  test("track_without_any_text_is_empty", () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 1 },
        { tStartMs: 10, aAppend: 1, segs: [{ utf8: "\n" }] },
      ],
    });

    expect(errorCodeOf(ASR_EN, body)).toBe("TIMEDTEXT_EMPTY");
    expect(errorCodeOf(MANUAL_EN, body)).toBe("TIMEDTEXT_EMPTY");
  });
});
