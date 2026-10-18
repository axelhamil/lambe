import { describe, expect, test } from "bun:test";
import { reflowLines } from "./comment-reflow";

describe("reflowLines", () => {
  test("splits_two_lines_in_proportion_to_the_original_lengths", () => {
    const lines = reflowLines("fusionner la branche par défaut dans votre copie locale", [24, 20]);

    expect(lines).toEqual(["fusionner la branche par défaut", "dans votre copie locale"]);
  });

  test("splits_three_lines_and_keeps_a_short_line_short", () => {
    const lines = reflowLines("one two three four five six seven eight nine ten", [30, 30, 5]);

    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line !== "")).toBe(true);
    expect(lines.join(" ")).toBe("one two three four five six seven eight nine ten");
    expect(lines[2]?.split(" ")).toHaveLength(1);
  });

  test("splits_five_equal_lines_evenly", () => {
    const lines = reflowLines("a1 a2 b1 b2 c1 c2 d1 d2 e1 e2", [5, 5, 5, 5, 5]);

    expect(lines).toEqual(["a1 a2", "b1 b2", "c1 c2", "d1 d2", "e1 e2"]);
  });

  test("keeps_every_line_non_empty_when_one_line_dominates", () => {
    const lines = reflowLines("alpha beta gamma delta", [200, 1, 1]);

    expect(lines).toEqual(["alpha beta", "gamma", "delta"]);
  });

  test("fewer_words_than_lines_fills_the_first_lines_one_word_each", () => {
    expect(reflowLines("fork it", [10, 10, 10])).toEqual(["fork", "it", ""]);
  });

  test("single_line_is_the_whole_sentence", () => {
    expect(reflowLines("  sync the fork  ", [12])).toEqual(["sync the fork"]);
  });

  test("zero_length_lines_stay_empty_and_take_no_words", () => {
    expect(reflowLines("one two three four", [9, 0, 9])).toEqual(["one two", "", "three four"]);
    expect(reflowLines("solo", [5, 0, 5])).toEqual(["solo", "", ""]);
  });
});
