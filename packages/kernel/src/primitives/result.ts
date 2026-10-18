type ResultState<T, E> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "fail"; readonly error: E };

export class Result<T, E = string> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly state: ResultState<T, E>;

  private constructor(state: ResultState<T, E>) {
    this.state = state;
    this.isSuccess = state.kind === "ok";
    this.isFailure = state.kind === "fail";
  }

  public getValue(): T {
    const state = this.state;

    if (state.kind === "fail") throw new Error("Can't get value from failure result");

    return state.value;
  }

  public getError(): E {
    const state = this.state;

    if (state.kind === "ok") throw new Error("Can't get error from success result");

    return state.error;
  }

  public unwrapOr(defaultValue: T): T {
    return this.state.kind === "ok" ? this.state.value : defaultValue;
  }

  public map<U>(f: (value: T) => U): Result<U, E> {
    return this.state.kind === "ok"
      ? Result.ok(f(this.state.value))
      : Result.fail(this.state.error);
  }

  public flatMap<U, F = E>(f: (value: T) => Result<U, F>): Result<U, E | F> {
    return this.state.kind === "ok" ? f(this.state.value) : Result.fail(this.state.error);
  }

  public mapError<F>(f: (error: E) => F): Result<T, F> {
    return this.state.kind === "ok"
      ? Result.ok(this.state.value)
      : Result.fail(f(this.state.error));
  }

  public match<U>(patterns: { ok: (value: T) => U; fail: (error: E) => U }): U {
    return this.state.kind === "ok"
      ? patterns.ok(this.state.value)
      : patterns.fail(this.state.error);
  }

  public static ok<E = string>(): Result<void, E>;
  public static ok<T, E = string>(value: T): Result<T, E>;
  public static ok<T, E = string>(value?: T): Result<T | undefined, E> {
    return new Result<T | undefined, E>({ kind: "ok", value });
  }

  public static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>({ kind: "fail", error });
  }
}
