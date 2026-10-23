import type { Result } from "../primitives/result";

function inKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inKeyOrder);

  if (typeof value !== "object" || value === null || value instanceof Date) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, inKeyOrder(entry)]),
  );
}

export abstract class ValueObject<T> {
  private readonly frozen: T;

  public constructor(value: T) {
    this.frozen = Object.freeze(value);
  }

  get value(): T {
    return this.frozen;
  }

  public equals(other: ValueObject<T>): boolean {
    if (this.frozen === other.value) return true;

    const bothObjects =
      typeof this.frozen === "object" &&
      this.frozen !== null &&
      typeof other.value === "object" &&
      other.value !== null;

    if (!bothObjects) return false;

    return JSON.stringify(inKeyOrder(this.frozen)) === JSON.stringify(inKeyOrder(other.value));
  }

  protected abstract validate(value: T): Result<T, string>;

  public static create<T extends ValueObject<V>, V>(
    this: new (
      value: V,
    ) => T,
    value: NoInfer<V>,
  ): Result<T, string> {
    const candidate = new this(value);

    return candidate
      .validate(value)
      .map((validated) => (Object.is(validated, value) ? candidate : new this(validated)));
  }
}
