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

function isSection(value: string): value is SectionId {
  return SECTIONS.some((section) => section === value);
}

export function sectionFromHash(hash: string): SectionId {
  const name = hash.replace(/^#/, "").split("?")[0] ?? "";

  return isSection(name) ? name : DEFAULT_SECTION;
}

export function hashOf(section: SectionId): string {
  return `#${section}`;
}
