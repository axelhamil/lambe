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
