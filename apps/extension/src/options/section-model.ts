import { Option } from "@lambe/kernel/option";
import type { MessageKey } from "../i18n/t";

export const SECTIONS = [
  "provider",
  "translation",
  "sites",
  "youtube",
  "prompt",
  "cache",
  "shortcut",
  "privacy",
] as const;

export type SectionId = (typeof SECTIONS)[number];

export interface NavGroup {
  label: MessageKey;
  sections: SectionId[];
}

const DEFAULT_SECTION: SectionId = "provider";

export const SECTION_NAME = {
  provider: "options.shell.section.provider",
  translation: "options.shell.section.translation",
  sites: "options.shell.section.sites",
  youtube: "options.shell.section.youtube",
  prompt: "options.shell.section.prompt",
  cache: "options.shell.section.cache",
  shortcut: "options.shell.section.shortcut",
  privacy: "options.shell.section.privacy",
} satisfies Record<SectionId, MessageKey>;

export const SECTION_SUMMARY = {
  provider: "options.shell.summary.provider",
  translation: "options.shell.summary.translation",
  sites: "options.shell.summary.sites",
  youtube: "options.shell.summary.youtube",
  prompt: "options.shell.summary.prompt",
  cache: "options.shell.summary.cache",
  shortcut: "options.shell.summary.shortcut",
  privacy: "options.shell.summary.privacy",
} satisfies Record<SectionId, MessageKey>;

export const NAV_GROUPS: NavGroup[] = [
  { label: "options.shell.group.setup", sections: ["provider", "translation"] },
  { label: "options.shell.group.reach", sections: ["sites", "youtube", "shortcut"] },
  { label: "options.shell.group.tuning", sections: ["prompt", "cache"] },
  { label: "options.shell.group.data", sections: ["privacy"] },
];

function isSection(value: string): value is SectionId {
  return SECTIONS.some((section) => section === value);
}

export function sectionFromHash(hash: string): SectionId {
  const name = hash.replace(/^#/, "").split("?")[0] ?? "";

  return isSection(name) ? name : DEFAULT_SECTION;
}

export function hashParam(hash: string, name: string): Option<string> {
  const query = hash.split("?")[1];

  if (query === undefined) return Option.none();

  return Option.fromNullable(new URLSearchParams(query).get(name));
}

export function hashOf(section: SectionId): string {
  return `#${section}`;
}
