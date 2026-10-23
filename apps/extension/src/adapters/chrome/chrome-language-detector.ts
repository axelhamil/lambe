import { Option } from "@lambe/kernel/option";
import type { LanguageDetector } from "@lambe/translation/application/ports/language-detector";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";

export type DetectLanguage = (text: string) => Promise<chrome.i18n.LanguageDetectionResult>;

const UNDETERMINED = "und";

function topLanguage(result: chrome.i18n.LanguageDetectionResult): Option<string> {
  const ranked = [...result.languages].sort((left, right) => right.percentage - left.percentage);

  return Option.fromNullable(ranked[0]?.language);
}

export class ChromeLanguageDetector implements LanguageDetector {
  public constructor(private readonly detectLanguage: DetectLanguage) {}

  public async detect(text: string): Promise<Option<LanguageCode>> {
    try {
      const result = await this.detectLanguage(text);

      if (!result.isReliable) return Option.none();

      return topLanguage(result)
        .filter((language) => language !== UNDETERMINED)
        .flatMap((language) =>
          LanguageCode.create(language).match({
            ok: (code) => Option.some(code),
            fail: () => Option.none(),
          }),
        );
    } catch {
      return Option.none();
    }
  }
}
