import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { LanguageCode } from "../language/value-objects/language-code.vo";
import type { PageBrief } from "../page/page-brief";
import type { PromptInput } from "./prompt-adapter";
import { translateGemmaPrompt } from "./translategemma-prompt";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const brief: PageBrief = {
  host: "github.com",
  title: "Contributing guide",
  description: "How to open a pull request.",
  headings: ["Contributing", "Forking the repository"],
  sourceLanguage: Option.some(language("en")),
};

const input = (overrides: Partial<PromptInput> = {}): PromptInput => ({
  source: Option.some(language("en")),
  target: language("fr"),
  brief,
  segments: [
    { n: 1, markup: "Open a <g1>pull request</g1>." },
    { n: 2, markup: "Run <x1/> first." },
  ],
  ...overrides,
});

const contentOf = (prompt: PromptInput): string =>
  translateGemmaPrompt.build(prompt)[0]?.content ?? "";

describe("translateGemmaPrompt", () => {
  test("produces_one_user_message_and_no_system", () => {
    const messages = translateGemmaPrompt.build(input());

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
  });

  test("uses_model_card_wording", () => {
    const content = contentOf(input());

    expect(content).toStartWith(
      "You are a professional English (en) to French (fr) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to French grammar, vocabulary, and cultural sensitivities.",
    );
    expect(content).toContain(
      "Produce only the French translation, without any additional explanations or commentary. Please translate the following English text into French:",
    );
  });

  test("states_tag_preservation_rule", () => {
    const content = contentOf(input());

    expect(content).toContain(
      "Keep the [N] number at the start of every line and every <xN/> and <gN>...</gN> tag exactly as given",
    );
  });

  test("unknown_source_uses_generic_wording", () => {
    const content = contentOf(input({ source: Option.none() }));

    expect(content).toStartWith("You are a professional translator into French (fr).");
    expect(content).toContain("Please translate the following text into French:");
    expect(content).not.toContain("English");
  });

  test("includes_encoded_batch_after_the_instructions", () => {
    const content = contentOf(input());

    expect(content).toEndWith(
      "into French:\n\n\n[1] Open a <g1>pull request</g1>.\n[2] Run <x1/> first.",
    );
  });
});
