import { describe, expect, test } from "bun:test";
import { BlockId } from "./block-id.vo";

describe("BlockId", () => {
  test("rejects_empty_and_whitespace", () => {
    expect(BlockId.create("").isFailure).toBe(true);
    expect(BlockId.create("b 12").isFailure).toBe(true);
    expect(BlockId.create(" ").isFailure).toBe(true);
    expect(BlockId.create("b12").getValue().value).toBe("b12");
  });
});
