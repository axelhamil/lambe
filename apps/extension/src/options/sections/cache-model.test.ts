import { describe, expect, test } from "bun:test";
import { formatBytes } from "./cache-model";

describe("cache settings", () => {
  test("size_reads_in_the_largest_fitting_unit", () => {
    expect(formatBytes(0, "en")).toBe("0 byte");
    expect(formatBytes(2_400, "en")).toBe("2.4 kB");
    expect(formatBytes(3_450_000, "en")).toBe("3.5 MB");
  });
});
