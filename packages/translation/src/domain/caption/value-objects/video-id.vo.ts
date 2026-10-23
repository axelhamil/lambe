import { Result } from "@lambe/kernel/result";
import { ValueObject } from "@lambe/kernel/value-object";
import { z } from "zod";

const videoIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, "Video id must be the 11 character YouTube id.");

export class VideoId extends ValueObject<string> {
  protected validate(value: string): Result<string, string> {
    const parsed = videoIdSchema.safeParse(value);

    if (!parsed.success) return Result.fail(parsed.error.issues[0]?.message ?? "Invalid video id.");

    return Result.ok(parsed.data);
  }
}
