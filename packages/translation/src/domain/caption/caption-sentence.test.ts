import { describe, expect, test } from "bun:test";
import { type CaptionSentence, sentenceId } from "./caption-sentence";
import { VideoId } from "./value-objects/video-id.vo";

describe("sentenceId", () => {
  test("joins_the_video_id_and_the_sentence_index", () => {
    const sentence: CaptionSentence = {
      id: sentenceId(VideoId.create("dQw4w9WgXcQ").getValue(), 12),
      index: 12,
      startMs: 0,
      endMs: 900,
      text: "Never gonna give you up.",
      sound: false,
    };

    expect(sentence.id.value).toBe("dQw4w9WgXcQ:12");
  });
});
