import { describe, expect, test } from "bun:test";
import { Result } from "./result";

describe("Result", () => {
  test("ok_exposes_value", () => {
    const result = Result.ok<number, string>(42);

    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.getValue()).toBe(42);
  });

  test("fail_exposes_error", () => {
    const result = Result.fail<number, string>("BOOM");

    expect(result.isFailure).toBe(true);
    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toBe("BOOM");
    expect(result.unwrapOr(7)).toBe(7);
  });

  test("getValue_on_failure_throws", () => {
    const result = Result.fail<number, string>("BOOM");

    expect(() => result.getValue()).toThrow();
    expect(() => Result.ok<number, string>(1).getError()).toThrow();
  });

  test("map_and_flatMap_short_circuit_on_failure", () => {
    let calls = 0;
    const double = (value: number): number => {
      calls += 1;
      return value * 2;
    };
    const failed = Result.fail<number, string>("BOOM");

    const mapped = failed.map(double);
    const chained = failed.flatMap((value) => Result.ok<number, string>(double(value)));

    expect(mapped.getError()).toBe("BOOM");
    expect(chained.getError()).toBe("BOOM");
    expect(calls).toBe(0);
    expect(Result.ok<number, string>(2).map(double).getValue()).toBe(4);
    expect(
      Result.ok<number, string>(2)
        .flatMap(() => Result.fail("NOPE"))
        .getError(),
    ).toBe("NOPE");
    expect(failed.mapError((error) => `${error}!`).getError()).toBe("BOOM!");
  });

  test("match_calls_the_right_branch", () => {
    const describeResult = (result: Result<number, string>): string =>
      result.match({ ok: (value) => `ok ${value}`, fail: (error) => `fail ${error}` });

    expect(describeResult(Result.ok(1))).toBe("ok 1");
    expect(describeResult(Result.fail("BOOM"))).toBe("fail BOOM");
  });
});
