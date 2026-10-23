import { describe, expect, test } from "bun:test";
import { isProtectedInline } from "./protected-nodes";

const link = (text: string, href = "#"): Element => {
  const doc = new DOMParser().parseFromString("<html><body></body></html>", "text/html");
  const anchor = doc.createElement("a");
  anchor.setAttribute("href", href);
  anchor.textContent = text;

  return anchor;
};

describe("isProtectedInline on links", () => {
  test("slash_separated_words_are_ordinary_links", () => {
    expect(["and/or", "TCP/IP", "Yes/No"].map((text) => isProtectedInline(link(text)))).toEqual([
      false,
      false,
      false,
    ]);
  });

  test("url_and_path_shaped_text_is_protected", () => {
    const texts = [
      "/docs",
      "./setup.sh",
      "~/projects",
      "../README",
      "https://github.com",
      "www.example.org",
      "src/index.ts",
      "github.com/octocat",
    ];

    expect(texts.filter((text) => !isProtectedInline(link(text)))).toEqual([]);
  });

  test("text_that_ends_the_href_path_is_protected", () => {
    expect(
      isProtectedInline(link("octocat/Spoon-Knife", "https://github.com/octocat/Spoon-Knife")),
    ).toBe(true);
  });
});

describe("isProtectedInline on citations", () => {
  test("reference_superscripts_are_atoms_and_other_superscripts_are_text", () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><p>Text<sup class="reference"><a href="#cite_note-1"><span>[</span>1<span>]</span></a></sup> and <sup>[note 2]</sup>, x<sup>2</sup> and <sup class="noprint">[citation needed]</sup></p></body></html>',
      "text/html",
    );

    const protectedSups = [...doc.querySelectorAll("sup")].map(isProtectedInline);

    expect(protectedSups).toEqual([true, true, false, false]);
  });
});
