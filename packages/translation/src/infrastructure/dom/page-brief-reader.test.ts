import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { readPageBrief } from "./page-brief-reader";

const fixture = async (name: string): Promise<Document> => {
  const html = await readFile(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8");

  return new DOMParser().parseFromString(html, "text/html");
};

describe("readPageBrief", () => {
  test("page_brief_has_title_h1_and_html_lang", async () => {
    const doc = await fixture("github-fork-a-repo.html");

    const brief = readPageBrief(doc);

    expect(brief.title).toBe("Fork a repository - GitHub Docs");
    expect(brief.description).toStartWith("Fork a repository on GitHub to propose changes");
    expect(brief.headings[0]).toBe("Fork a repository");
    expect(brief.headings.length).toBeLessThanOrEqual(6);
    expect(brief.headings).toContain("About forks");
    expect(brief.sourceLanguage.map((code) => code.value).toUndefined()).toBe("en");
  });

  test("missing_or_invalid_html_lang_gives_no_source_language", () => {
    const missing = new DOMParser().parseFromString(
      "<html><body><h1>Hi</h1></body></html>",
      "text/html",
    );
    const invalid = new DOMParser().parseFromString(
      '<html lang="??"><body></body></html>',
      "text/html",
    );

    expect(readPageBrief(missing).sourceLanguage.isNone()).toBe(true);
    expect(readPageBrief(invalid).sourceLanguage.isNone()).toBe(true);
  });
});
