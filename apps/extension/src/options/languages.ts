import { Option } from "@lambe/kernel/option";
import { languageName } from "@lambe/translation/domain/language/language-name";

export interface LanguageOption {
  code: string;
  label: string;
  native: string;
}

const TARGET_CODES = [
  "af",
  "ar",
  "bg",
  "bn",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fil",
  "fr",
  "ga",
  "gl",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "ka",
  "kn",
  "ko",
  "lt",
  "lv",
  "mk",
  "ml",
  "mr",
  "ms",
  "nb",
  "nl",
  "pa",
  "pl",
  "pt",
  "pt-BR",
  "ro",
  "ru",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
  "zh-TW",
];

const MARKS = /\p{M}/gu;

function fold(text: string): string {
  return text.normalize("NFD").replace(MARKS, "").toLowerCase().trim();
}

function capitalized(label: string, locale: string): string {
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

export function labelOf(code: string, uiLanguage: string): string {
  return capitalized(languageName(code, [uiLanguage, "en"]), uiLanguage);
}

function nativeLabelOf(code: string): string {
  const native = labelOf(code, code);

  return code !== "en" && native === labelOf(code, "en") ? "" : native;
}

export function languageOptions(uiLanguage: string): LanguageOption[] {
  return TARGET_CODES.map((code) => ({
    code,
    label: labelOf(code, uiLanguage),
    native: nativeLabelOf(code),
  })).toSorted((a, b) => a.label.localeCompare(b.label, uiLanguage));
}

export function searchLanguages(options: LanguageOption[], query: string): LanguageOption[] {
  const wanted = fold(query);

  if (wanted === "") return options;

  return options.filter(
    ({ code, label, native }) =>
      fold(label).includes(wanted) || fold(native).includes(wanted) || fold(code) === wanted,
  );
}

export function browserLanguage(
  options: LanguageOption[],
  uiLanguage: string,
): Option<LanguageOption> {
  const tag = uiLanguage.replace("_", "-");
  const primary = tag.split("-")[0] ?? tag;

  return Option.fromNullable(
    options.find(({ code }) => code === tag) ?? options.find(({ code }) => code === primary),
  );
}
