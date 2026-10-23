import { describe, expect, test } from "bun:test";
import { LanguageCode } from "../language/value-objects/language-code.vo";
import { type CaptionTrack, trackSignature } from "./caption-track";
import { VideoId } from "./value-objects/video-id.vo";

const track: CaptionTrack = {
  videoId: VideoId.create("dQw4w9WgXcQ").getValue(),
  language: LanguageCode.create("en").getValue(),
  generated: true,
  units: [
    { text: "never", startMs: 0, endMs: 400 },
    { text: "gonna", startMs: 400, endMs: 800 },
  ],
};

describe("trackSignature", () => {
  test("signature_changes_with_language_and_content", () => {
    const same = { ...track, units: track.units.map((unit) => ({ ...unit })) };
    const french = { ...track, language: LanguageCode.create("fr").getValue() };
    const longer = {
      ...track,
      units: [...track.units, { text: "give", startMs: 800, endMs: 1200 }],
    };
    const reworded = {
      ...track,
      units: [...track.units.slice(0, 1), { text: "gone", startMs: 400, endMs: 800 }],
    };

    expect(trackSignature(same)).toBe(trackSignature(track));
    expect(trackSignature(french)).not.toBe(trackSignature(track));
    expect(trackSignature(longer)).not.toBe(trackSignature(track));
    expect(trackSignature(reworded)).not.toBe(trackSignature(track));
  });
});
