import { Result } from "@lambe/kernel/result";
import { ValueObject } from "@lambe/kernel/value-object";
import { z } from "zod";

const blockIdSchema = z
  .string()
  .min(1, "Block id must not be empty.")
  .regex(/^\S+$/, "Block id must not contain whitespace.");

export class BlockId extends ValueObject<string> {
  protected validate(value: string): Result<string, string> {
    const parsed = blockIdSchema.safeParse(value);

    if (!parsed.success) return Result.fail(parsed.error.issues[0]?.message ?? "Invalid block id.");

    return Result.ok(parsed.data);
  }
}
