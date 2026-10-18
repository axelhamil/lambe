import { describe, expect, test } from "bun:test";
import { clampTop, restingLeft, snapSide } from "./placement";

describe("bubble placement", () => {
  test("snaps_left_when_center_is_in_left_half", () => {
    expect(snapSide(399, 800)).toBe("left");
    expect(restingLeft("left", 800, 38)).toBe(4);
  });

  test("snaps_right_otherwise", () => {
    expect(snapSide(400, 800)).toBe("right");
    expect(snapSide(790, 800)).toBe("right");
    expect(restingLeft("right", 800, 38)).toBe(758);
  });

  test("clamps_top_between_40_and_height_minus_size_minus_6", () => {
    expect(clampTop(-20, 600, 38)).toBe(40);
    expect(clampTop(300, 600, 38)).toBe(300);
    expect(clampTop(900, 600, 38)).toBe(556);
  });
});
