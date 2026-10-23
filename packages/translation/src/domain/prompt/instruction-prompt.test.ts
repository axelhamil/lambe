import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import type { CaptionBrief } from "../caption/caption-brief";
import { LanguageCode } from "../language/value-objects/language-code.vo";
import type { PageBrief } from "../page/page-brief";
import { instructionPrompt } from "./instruction-prompt";
import type { PromptInput } from "./prompt-adapter";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const brief: PageBrief = {
  kind: "page",
  host: "github.com",
  url: "https://github.com/about-forks",
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
  guidelines: "",
};

const CUSTOM = "Use formal French and translate every technical term.";

const systemOf = (): string => instructionPrompt.build(input)[0]?.content ?? "";

describe("instructionPrompt", () => {
  test("produces_system_then_user", () => {
    const messages = instructionPrompt.build(input);

    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(messages[1]?.content).toEndWith("[1] Fork the <g1>repository</g1>.");
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

  test("caption_brief_puts_video_context_in_system", () => {
    const captionBrief: CaptionBrief = {
      kind: "captions",
      host: "www.youtube.com",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "How forks work",
      channel: "Git Weekly",
      description: "",
      generated: false,
      preceding: ["So you want a fork."],
    };
    const messages = instructionPrompt.build({ ...input, brief: captionBrief });
    const system = messages[0]?.content ?? "";

    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(system).toContain('Video: "How forks work" by Git Weekly on www.youtube.com.');
    expect(system).toContain("natural spoken French, short enough");
    expect(system).toContain(
      "Previous lines, for context only, do not translate them: So you want a fork.",
    );
    expect(system).toContain("Return exactly the segments you received");
    expect(system).not.toContain("Site: www.youtube.com");
    expect(system).not.toContain("Page context:");
    expect(system).not.toContain("<xN/>");
    expect(messages[1]?.content).toEndWith("[1] Fork the <g1>repository</g1>.");
  });

  test("custom_guidelines_replace_the_default_block", () => {
    const system = instructionPrompt.build({ ...input, guidelines: CUSTOM })[0]?.content ?? "";

    expect(system).toContain(CUSTOM);
    expect(system).not.toContain("Leave terms of art");
    expect(system).not.toContain("Keep the tone, register and formatting");
  });

  test("tag_rule_stays_when_guidelines_are_customized", () => {
    const system = instructionPrompt.build({ ...input, guidelines: CUSTOM })[0]?.content ?? "";

    expect(system).toContain("Never translate or change anything inside <xN/>");
    expect(system).toContain("Return exactly the segments you received, one [N] line each");
  });

  test("caption_prompt_ignores_guidelines", () => {
    const captionBrief: CaptionBrief = {
      kind: "captions",
      host: "www.youtube.com",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "How forks work",
      channel: "Git Weekly",
      description: "",
      generated: false,
      preceding: [],
    };
    const captions = { ...input, brief: captionBrief };

    expect(instructionPrompt.build({ ...captions, guidelines: CUSTOM })).toEqual(
      instructionPrompt.build(captions),
    );
  });
});
