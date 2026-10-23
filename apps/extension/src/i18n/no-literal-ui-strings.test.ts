import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCANNED = ["../bubble/", "../youtube/"].map((dir) => new URL(dir, import.meta.url));
const LITERAL_SINKS = [
  /\.(textContent|title)\s*=\s*["'`]/,
  /setAttribute\(\s*["'](aria-label|aria-description|title)["']\s*,\s*["'`]/,
];

function sources(dir: URL): URL[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => new URL(name, dir));
}

function offendingLines(file: URL): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => LITERAL_SINKS.some((sink) => sink.test(line)))
    .map((line) => `${fileURLToPath(file)}: ${line.trim()}`);
}

describe("ui strings", () => {
  test("no_literal_ui_strings_reach_the_dom_in_the_bubble_or_youtube", () => {
    const offending = SCANNED.flatMap(sources).flatMap(offendingLines);

    expect(offending).toEqual([]);
  });
});
