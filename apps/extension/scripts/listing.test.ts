import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import config from "../wxt.config";

const STORE_DIR = resolve(import.meta.dir, "../../../docs/store");

const SHORT_DESCRIPTION_MAX = 132;

const LISTINGS = [
  { file: "listing.en.md", short: "Short description", permissions: "Permission justifications" },
  {
    file: "listing.fr.md",
    short: "Description courte",
    permissions: "Justification des autorisations",
  },
];

function manifestPermissions(): string[] {
  const manifest = config.manifest;

  if (typeof manifest !== "object" || manifest instanceof Promise) {
    throw new Error("The manifest in wxt.config.ts must be a plain object.");
  }

  return [
    ...(manifest.permissions ?? []),
    ...(manifest.host_permissions ?? []),
    ...(manifest.optional_host_permissions ?? []),
  ];
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);

  if (start === -1) {
    throw new Error(`Missing section "## ${heading}".`);
  }

  const body = markdown.slice(start + heading.length + 5);
  const end = body.indexOf("\n## ");

  return (end === -1 ? body : body.slice(0, end)).trim();
}

function justifiedPermissions(markdown: string, heading: string): string[] {
  const headings = section(markdown, heading).matchAll(/^### `([^`]+)`$/gm);

  return [...headings].map((match) => match[1] ?? "");
}

async function read(file: string): Promise<string> {
  return Bun.file(resolve(STORE_DIR, file)).text();
}

describe("store listing", () => {
  test("short_descriptions_fit_132_characters", async () => {
    for (const listing of LISTINGS) {
      const short = section(await read(listing.file), listing.short);

      expect(short.length).toBeGreaterThan(0);
      expect([...short].length).toBeLessThanOrEqual(SHORT_DESCRIPTION_MAX);
    }
  });

  test("both_listings_cover_every_manifest_permission", async () => {
    const declared = manifestPermissions();

    expect(declared.length).toBeGreaterThan(0);

    for (const listing of LISTINGS) {
      const justified = justifiedPermissions(await read(listing.file), listing.permissions);

      expect(justified).toEqual(expect.arrayContaining(declared));
    }
  });

  test("listings_mention_no_permission_the_manifest_lacks", async () => {
    const declared = manifestPermissions();

    for (const listing of LISTINGS) {
      const justified = justifiedPermissions(await read(listing.file), listing.permissions);

      expect(declared).toEqual(expect.arrayContaining(justified));
      expect(new Set(justified).size).toBe(justified.length);
    }
  });
});
