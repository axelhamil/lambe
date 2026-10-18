import { Result } from "./result";

export abstract class Option<T> {
  abstract isSome(): boolean;
  abstract isNone(): boolean;
  abstract unwrap(): T;
  abstract unwrapOr(defaultValue: T): T;
  abstract map<U>(f: (value: T) => U): Option<U>;
  abstract flatMap<U>(f: (value: T) => Option<U>): Option<U>;
  abstract filter(predicate: (value: T) => boolean): Option<T>;
  abstract toUndefined(): T | undefined;
  abstract toResult<E>(error: E): Result<T, E>;

  static some<T>(value: T): Option<T> {
    return new Some(value);
  }

  static none<T>(): Option<T> {
    return new None<T>();
  }

  static fromNullable<T>(value: T | null | undefined): Option<T> {
    return value === null || value === undefined ? Option.none<T>() : Option.some(value);
  }
}

class Some<T> extends Option<T> {
  public constructor(private readonly value: T) {
    super();
  }

  isSome(): boolean {
    return true;
  }

  isNone(): boolean {
    return false;
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }

  map<U>(f: (value: T) => U): Option<U> {
    return Option.some(f(this.value));
  }

  flatMap<U>(f: (value: T) => Option<U>): Option<U> {
    return f(this.value);
  }

  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : Option.none<T>();
  }

  toUndefined(): T | undefined {
    return this.value;
  }

  toResult<E>(_error: E): Result<T, E> {
    return Result.ok(this.value);
  }
}

class None<T> extends Option<T> {
  isSome(): boolean {
    return false;
  }

  isNone(): boolean {
    return true;
  }

  unwrap(): T {
    throw new Error("Called unwrap on a None value");
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  map<U>(_f: (value: T) => U): Option<U> {
    return Option.none<U>();
  }

  flatMap<U>(_f: (value: T) => Option<U>): Option<U> {
    return Option.none<U>();
  }

  filter(_predicate: (value: T) => boolean): Option<T> {
    return this;
  }

  toUndefined(): T | undefined {
    return undefined;
  }

  toResult<E>(error: E): Result<T, E> {
    return Result.fail(error);
  }
}
