import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { RECENT_TARGETS_LIMIT } from "./settings";

const FIXED_CHOICES = ["en", "fr"];

const MOST_USED_SHOWN = 6;

export function withRecentTarget(recent: string[], code: string): string[] {
  return [code, ...recent].slice(0, RECENT_TARGETS_LIMIT);
}

function byUse(recent: string[]): string[] {
  const uses = new Map<string, number>();

  for (const code of recent) uses.set(code, (uses.get(code) ?? 0) + 1);

  return [...uses.keys()].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0));
}

export function menuLanguages(target: string, recent: string[]): LanguageCode[] {
  const fixed = [target, ...FIXED_CHOICES];
  const mostUsed = byUse(recent)
    .filter((code) => !fixed.includes(code))
    .slice(0, MOST_USED_SHOWN);

  return [...new Set([...fixed, ...mostUsed])].flatMap((code) =>
    LanguageCode.create(code).match({ ok: (language) => [language], fail: () => [] }),
  );
}
