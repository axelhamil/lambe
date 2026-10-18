import { resolve } from "node:path";
import { z } from "zod";

const MANIFEST_PATH = resolve(import.meta.dir, "../.output/chrome-mv3/manifest.json");

const manifestSchema = z.object({ key: z.string().optional() });

const storeBuild = process.env.LAMBE_STORE === "1";
const manifest = manifestSchema.parse(await Bun.file(MANIFEST_PATH).json());
const hasKey = manifest.key !== undefined;

if (storeBuild && hasKey) {
  console.error("Store build manifest must not contain `key`: the Chrome Web Store rejects it.");
  process.exit(1);
}

if (!storeBuild && !hasKey) {
  console.error("Dev build manifest must contain `key` to keep the unpacked extension id stable.");
  process.exit(1);
}

const buildKind = storeBuild ? "store" : "dev";
console.log(`Manifest key ${hasKey ? "present" : "absent"} as expected for a ${buildKind} build.`);
