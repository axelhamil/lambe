import type { Option } from "@lambe/kernel/option";
import type { LanguageCode } from "./value-objects/language-code.vo";

const MIN_RELIABLE_CHAR_COUNT = 12;

interface SkipInput {
  detected: Option<LanguageCode>;
  target: LanguageCode;
  charCount: number;
}

export function shouldSkipBlock({ detected, target, charCount }: SkipInput): boolean {
  if (charCount < MIN_RELIABLE_CHAR_COUNT) return false;

  return detected.map((language) => language.sharesPrimarySubtagWith(target)).unwrapOr(false);
}
