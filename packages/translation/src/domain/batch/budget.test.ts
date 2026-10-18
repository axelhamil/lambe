import { describe, expect, test } from "bun:test";
import type { BatchSegment } from "./batch-format";
import { encodeBatch } from "./batch-format";
import { estimateTokens, maxInputTokens, planBatches } from "./budget";

const segment = (n: number, length: number): BatchSegment => ({ n, markup: "a".repeat(length) });

describe("budget", () => {
  test("estimateTokens(abc)_is_1", () => {
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcd")).toBe(2);
  });

  test("maxInputTokens(2048,300)_is_760", () => {
    expect(maxInputTokens(2048, 300)).toBe(760);
  });

  test("planBatches_respects_budget_and_segment_cap", () => {
    const segments = Array.from({ length: 10 }, (_, index) => segment(index + 1, 120));

    const batches = planBatches(segments, 100, 3);

    expect(batches.length).toBeGreaterThan(3);

    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(3);
      expect(estimateTokens(encodeBatch(batch))).toBeLessThanOrEqual(100);
    }
  });

  test("planBatches_preserves_order", () => {
    const segments = [segment(1, 30), segment(2, 600), segment(3, 30), segment(4, 30)];

    const batches = planBatches(segments, 100, 10);

    expect(batches.flat().map((item) => item.n)).toEqual([1, 2, 3, 4]);
    expect(batches.map((batch) => batch.map((item) => item.n))).toEqual([[1], [2], [3, 4]]);
  });
});
