import { resolve } from "node:path";
import { z } from "zod";

const MANIFEST_PATH = resolve(import.meta.dir, "../.output/chrome-mv3/manifest.json");

const ALL_SITES = new Set(["<all_urls>", "*://*/*"]);

const manifestSchema = z.object({
  key: z.string().optional(),
  host_permissions: z.array(z.string()).default([]),
  content_scripts: z.array(z.object({ matches: z.array(z.string()).default([]) })).default([]),
});

const storeBuild = process.env.LAMBE_STORE === "1";
const manifest = manifestSchema.parse(await Bun.file(MANIFEST_PATH).json());
const hasKey = manifest.key !== undefined;
const allSites = [
  ...manifest.host_permissions.map((pattern) => ({ field: "host_permissions", pattern })),
  ...manifest.content_scripts.flatMap((script) =>
    script.matches.map((pattern) => ({ field: "content_scripts.matches", pattern })),
  ),
].filter(({ pattern }) => ALL_SITES.has(pattern));

if (storeBuild && hasKey) {
  console.error("Store build manifest must not contain `key`: the Chrome Web Store rejects it.");
  process.exit(1);
}

if (storeBuild && allSites.length > 0) {
  for (const { field, pattern } of allSites) {
    console.error(`Store build manifest still requests \`${pattern}\` in ${field}.`);
  }

  console.error(
    "Narrow the permissions to activeTab plus optional host permissions before any store release.",
  );
  process.exit(1);
}

if (!storeBuild && !hasKey) {
  console.error("Dev build manifest must contain `key` to keep the unpacked extension id stable.");
  process.exit(1);
}

const buildKind = storeBuild ? "store" : "dev";
console.log(`Manifest key ${hasKey ? "present" : "absent"} as expected for a ${buildKind} build.`);
