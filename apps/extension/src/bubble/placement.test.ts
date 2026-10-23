import { describe, expect, test } from "bun:test";
import { clampTop, menuPosition, restingLeft, snapSide } from "./placement";

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

  test("menu_opens_away_from_the_bubble_edge_and_stays_inside_the_viewport", () => {
    const menu = { width: 200, height: 300 };
    const viewport = { width: 800, height: 600 };

    expect(menuPosition({ left: 758, right: 796, top: 500 }, menu, viewport)).toEqual({
      left: 550,
      top: 292,
    });
    expect(menuPosition({ left: 4, right: 42, top: 2 }, menu, viewport)).toEqual({
      left: 50,
      top: 8,
    });
  });
});
