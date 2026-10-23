import type { LanguageCode } from "../language/value-objects/language-code.vo";

export interface LanguageRules {
  breakWords: string[];
  abbreviations: string[];
}

const RULES: Record<string, LanguageRules> = {
  en: {
    breakWords: ["and", "but", "so", "because", "then", "i mean", "you know"],
    abbreviations: ["mr.", "mrs.", "ms.", "dr.", "st.", "vs.", "e.g.", "i.e.", "etc.", "u.s."],
  },
  fr: {
    breakWords: ["et", "mais", "donc", "parce que", "alors", "puis", "en fait"],
    abbreviations: ["m.", "mme.", "p. ex.", "etc.", "cf."],
  },
};

const BASE_RULES: LanguageRules = { breakWords: [], abbreviations: [] };

export function rulesFor(language: LanguageCode): LanguageRules {
  return RULES[language.primarySubtag()] ?? BASE_RULES;
}
