import { describe, expect, test } from "bun:test";
import { clampTop, menuPosition } from "./placement";

describe("tab placement", () => {
  test("keeps_the_tab_inside_the_viewport_height_with_an_8px_gap", () => {
    expect(clampTop(-20, 600, 40)).toBe(8);
    expect(clampTop(300, 600, 40)).toBe(300);
    expect(clampTop(900, 600, 40)).toBe(552);
  });

  test("menu_opens_left_of_the_tab_and_stays_inside_the_viewport", () => {
    const menu = { width: 200, height: 300 };
    const viewport = { width: 800, height: 600 };

    expect(menuPosition({ left: 772, top: 500 }, menu, viewport)).toEqual({ left: 564, top: 292 });
    expect(menuPosition({ left: 120, top: 2 }, menu, viewport)).toEqual({ left: 8, top: 8 });
  });
});
