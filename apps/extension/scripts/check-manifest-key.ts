import { resolve } from "node:path";
import { z } from "zod";
import { LOCAL_HOSTS, OPTIONAL_HOSTS } from "../src/permissions";

const MANIFEST_PATH = resolve(import.meta.dir, "../.output/chrome-mv3/manifest.json");

const EXPECTED_PERMISSIONS = ["storage", "unlimitedStorage", "activeTab", "scripting"];

const manifestSchema = z.object({
  name: z.string(),
  default_locale: z.string().optional(),
  key: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  host_permissions: z.array(z.string()).default([]),
  optional_host_permissions: z.array(z.string()).default([]),
  content_scripts: z.array(z.unknown()).default([]),
});

const storeBuild = process.env.LAMBE_STORE === "1";
const manifest = manifestSchema.parse(await Bun.file(MANIFEST_PATH).json());
const hasKey = manifest.key !== undefined;

const sameSet = (actual: string[], expected: string[]): boolean =>
  actual.length === expected.length && expected.every((entry) => actual.includes(entry));

const listed = (entries: string[]): string =>
  entries.length === 0 ? "nothing" : entries.join(", ");

const exactly = (field: string, actual: string[], expected: string[]): string[] =>
  sameSet(actual, expected)
    ? []
    : [`\`${field}\` must be exactly ${listed(expected)}, found ${listed(actual)}.`];

const problems = [
  ...(manifest.content_scripts.length === 0
    ? []
    : ["`content_scripts` must be empty: every script is registered at runtime."]),
  ...exactly("permissions", manifest.permissions, EXPECTED_PERMISSIONS),
  ...exactly("host_permissions", manifest.host_permissions, LOCAL_HOSTS),
  ...exactly("optional_host_permissions", manifest.optional_host_permissions, OPTIONAL_HOSTS),
  ...(manifest.default_locale === "en" ? [] : ["`default_locale` must be `en`."]),
  ...(manifest.name.startsWith("__MSG_") ? [] : ["`name` must come from the locale catalog."]),
  ...(storeBuild && hasKey
    ? ["Store build manifest must not contain `key`: the Chrome Web Store rejects it."]
    : []),
  ...(!storeBuild && !hasKey
    ? ["Dev build manifest must contain `key` to keep the unpacked extension id stable."]
    : []),
];

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }

  process.exit(1);
}

const buildKind = storeBuild ? "store" : "dev";
process.stdout.write(
  `Manifest is narrow and its key is ${hasKey ? "present" : "absent"} for a ${buildKind} build.\n`,
);
