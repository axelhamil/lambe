import type { Option } from "@lambe/kernel/option";
import type { LanguageCode } from "../language/value-objects/language-code.vo";

const SEPARATOR = "\u001f";

export interface CacheKeyParts {
  sourceMarkup: string;
  source: Option<LanguageCode>;
  target: LanguageCode;
  host: string;
  providerId: string;
  model: string;
  promptVersion: string;
}

export function cacheKey(parts: CacheKeyParts): string {
  return [
    parts.sourceMarkup,
    parts.source.map((language) => language.value).unwrapOr(""),
    parts.target.value,
    parts.host,
    parts.providerId,
    parts.model,
    parts.promptVersion,
  ].join(SEPARATOR);
}
