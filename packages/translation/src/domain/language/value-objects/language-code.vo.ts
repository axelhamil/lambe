import { Result } from "@lambe/kernel/result";
import { ValueObject } from "@lambe/kernel/value-object";
import { z } from "zod";

const languageCodeSchema = z
  .string()
  .transform((code) => code.replace(/^[^-]*/, (primary) => primary.toLowerCase()))
  .pipe(
    z
      .string()
      .regex(
        /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/,
        "Language code must be a BCP 47 tag such as fr or pt-BR.",
      ),
  );

export class LanguageCode extends ValueObject<string> {
  protected validate(value: string): Result<string, string> {
    const parsed = languageCodeSchema.safeParse(value);

    if (!parsed.success)
      return Result.fail(parsed.error.issues[0]?.message ?? "Invalid language code.");

    return Result.ok(parsed.data);
  }

  public primarySubtag(): string {
    return this.value.split("-")[0] ?? this.value;
  }

  public sharesPrimarySubtagWith(other: LanguageCode): boolean {
    return this.primarySubtag() === other.primarySubtag();
  }
}
