import { describe, expect, test } from "bun:test";
import { hostsBubble } from "./bubble-frames";

describe("bubble frames", () => {
  test("production_build_mounts_the_bubble_in_the_top_frame_only", () => {
    expect(hostsBubble({ isTop: true, allFrames: false })).toBe(true);
    expect(hostsBubble({ isTop: false, allFrames: false })).toBe(false);
  });

  test("all_frames_build_mounts_one_bubble_per_frame", () => {
    expect(hostsBubble({ isTop: false, allFrames: true })).toBe(true);
    expect(hostsBubble({ isTop: true, allFrames: true })).toBe(true);
  });
});
