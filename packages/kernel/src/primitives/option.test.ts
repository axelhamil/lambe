import { describe, expect, test } from "bun:test";
import { Option } from "./option";

describe("Option", () => {
  test("fromNullable_maps_null_and_undefined_to_none", () => {
    expect(Option.fromNullable<string>(null).isNone()).toBe(true);
    expect(Option.fromNullable<string>(undefined).isNone()).toBe(true);
    expect(Option.fromNullable(0).isSome()).toBe(true);
    expect(Option.fromNullable("").unwrap()).toBe("");
  });

  test("some_map_applies", () => {
    const option = Option.some(2)
      .map((value) => value * 3)
      .filter((value) => value > 5)
      .flatMap((value) => Option.some(`${value}`));

    expect(option.unwrap()).toBe("6");
    expect(option.toUndefined()).toBe("6");
    expect(
      Option.some(2)
        .filter((value) => value > 5)
        .isNone(),
    ).toBe(true);
  });

  test("none_unwrapOr_returns_default", () => {
    const none = Option.none<number>();

    expect(none.unwrapOr(9)).toBe(9);
    expect(none.map((value) => value + 1).isNone()).toBe(true);
    expect(none.toUndefined()).toBeUndefined();
    expect(() => none.unwrap()).toThrow();
  });

  test("toResult_fails_with_given_error_on_none", () => {
    expect(Option.none<number>().toResult("MISSING").getError()).toBe("MISSING");
    expect(Option.some(1).toResult("MISSING").getValue()).toBe(1);
  });
});
