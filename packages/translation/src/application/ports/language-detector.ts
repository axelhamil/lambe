import type { Option } from "@lambe/kernel/option";
import type { LanguageCode } from "../../domain/language/value-objects/language-code.vo";

export interface LanguageDetector {
  detect(text: string): Promise<Option<LanguageCode>>;
}
