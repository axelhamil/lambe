import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { LanguageCode } from "../language/value-objects/language-code.vo";
import type { PageBrief } from "../page/page-brief";
import { instructionPrompt } from "./instruction-prompt";
import type { PromptInput } from "./prompt-adapter";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const brief: PageBrief = {
  host: "github.com",
  title: "Contributing guide",
  description: "How to open a pull request.",
  headings: ["Contributing", "Forking the repository"],
  sourceLanguage: Option.some(language("en")),
};

const input: PromptInput = {
  source: Option.some(language("en")),
  target: language("fr"),
  brief,
  segments: [{ n: 1, markup: "Fork the <g1>repository</g1>." }],
};

const systemOf = (): string => instructionPrompt.build(input)[0]?.content ?? "";

describe("instructionPrompt", () => {
  test("produces_system_then_user", () => {
    const messages = instructionPrompt.build(input);

    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(messages[1]?.content).toEndWith('<seg n="1">Fork the <g1>repository</g1>.</seg>');
  });

  test("system_contains_domain_brief_title_host_and_headings", () => {
    const system = systemOf();

    expect(system).toContain("from English (en) into French (fr)");
    expect(system).toContain("Site: github.com");
    expect(system).toContain("Title: Contributing guide");
    expect(system).toContain("Description: How to open a pull request.");
    expect(system).toContain("Headings: Contributing | Forking the repository");
    expect(system).toContain("Infer the field of the page from this context");
  });

  test("system_tells_to_keep_jargon_and_return_exactly_the_segments", () => {
    const system = systemOf();

    expect(system).toContain("Leave terms of art in their original form");
    expect(system).toContain("fork, pull request, merge, commit, branch and deploy");

    const germanSystem =
      instructionPrompt.build({ ...input, target: language("de") })[0]?.content ?? "";

    expect(germanSystem).not.toContain("French");
    expect(system).toContain("Keep the tone, register and formatting");
    expect(system).toContain("Keep non breaking spaces and HTML entities");
    expect(system).toContain("Never translate or change anything inside <xN/>");
    expect(system).toContain("Return exactly the segments you received");
  });
});
