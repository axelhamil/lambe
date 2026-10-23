import { describe, expect, test } from "bun:test";
import { VideoId } from "./video-id.vo";

describe("VideoId", () => {
  test("accepts_an_eleven_char_youtube_id", () => {
    expect(VideoId.create("dQw4w9WgXcQ").getValue().value).toBe("dQw4w9WgXcQ");
    expect(VideoId.create("a-b_C1d2E3f").getValue().value).toBe("a-b_C1d2E3f");
  });

  test("rejects_urls_and_short_ids", () => {
    expect(VideoId.create("https://youtu.be/dQw4w9WgXcQ").isFailure).toBe(true);
    expect(VideoId.create("dQw4w9WgXc").isFailure).toBe(true);
    expect(VideoId.create("dQw4w9WgXcQ1").isFailure).toBe(true);
    expect(VideoId.create("dQw4w9 gXcQ").isFailure).toBe(true);
  });
});
