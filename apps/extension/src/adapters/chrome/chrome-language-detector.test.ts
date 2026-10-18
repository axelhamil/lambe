import { describe, expect, mock, test } from "bun:test";
import { ChromeLanguageDetector } from "./chrome-language-detector";

describe("ChromeLanguageDetector", () => {
  test("unreliable_detection_is_none", async () => {
    const unreliable = new ChromeLanguageDetector(
      mock(async () => ({ isReliable: false, languages: [{ language: "fr", percentage: 90 }] })),
    );
    const undetermined = new ChromeLanguageDetector(
      mock(async () => ({ isReliable: true, languages: [{ language: "und", percentage: 100 }] })),
    );
    const failing = new ChromeLanguageDetector(mock(async () => Promise.reject(new Error("no"))));

    expect((await unreliable.detect("Bonjour")).isNone()).toBe(true);
    expect((await undetermined.detect("1234")).isNone()).toBe(true);
    expect((await failing.detect("Bonjour")).isNone()).toBe(true);
  });

  test("reliable_detection_maps_to_language_code", async () => {
    const detector = new ChromeLanguageDetector(
      mock(async () => ({
        isReliable: true,
        languages: [
          { language: "en", percentage: 20 },
          { language: "pt-BR", percentage: 80 },
        ],
      })),
    );

    const detected = await detector.detect("Bom dia a todos");

    expect(detected.unwrap().value).toBe("pt-BR");
  });
});
