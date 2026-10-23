import type { Option } from "@lambe/kernel/option";
import type { LanguageCode } from "../language/value-objects/language-code.vo";

export interface PageBrief {
  host: string;
  url: string;
  title: string;
  description: string;
  headings: string[];
  sourceLanguage: Option<LanguageCode>;
}
