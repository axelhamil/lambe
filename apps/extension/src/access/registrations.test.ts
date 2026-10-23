import { describe, expect, test } from "bun:test";
import {
  OPTIONAL_HOSTS,
  PAGE_SCRIPT,
  YOUTUBE_CSS,
  YOUTUBE_MAIN_SCRIPT,
  YOUTUBE_MATCHES,
  YOUTUBE_SCRIPT,
} from "../permissions";
import { defaultSettings, type Settings } from "../settings/settings";
import { desiredRegistrations } from "./registrations";

const settingsWith = (change: Partial<Settings>): Settings => ({
  ...defaultSettings("en"),
  bubbleEverywhere: false,
  youtube: false,
  ...change,
});

const idsOf = (settings: Settings, granted: string[]): string[] =>
  desiredRegistrations(settings, granted).map((registration) => registration.id);

describe("desiredRegistrations", () => {
  test("page_script_needs_both_optional_origins", () => {
    const settings = settingsWith({ bubbleEverywhere: true });

    expect(idsOf(settings, ["https://*/*"])).toEqual([]);

    const [page] = desiredRegistrations(settings, OPTIONAL_HOSTS);

    expect(page).toEqual({
      id: "lambe-page",
      js: [PAGE_SCRIPT],
      css: [],
      matches: OPTIONAL_HOSTS,
      world: "ISOLATED",
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true,
    });
  });

  test("youtube_registers_main_at_document_start_and_isolated_at_idle", () => {
    const registrations = desiredRegistrations(settingsWith({ youtube: true }), YOUTUBE_MATCHES);

    expect(registrations).toEqual([
      {
        id: "lambe-youtube-main",
        js: [YOUTUBE_MAIN_SCRIPT],
        css: [],
        matches: YOUTUBE_MATCHES,
        world: "MAIN",
        runAt: "document_start",
        allFrames: false,
        persistAcrossSessions: true,
      },
      {
        id: "lambe-youtube",
        js: [YOUTUBE_SCRIPT],
        css: [YOUTUBE_CSS],
        matches: YOUTUBE_MATCHES,
        world: "ISOLATED",
        runAt: "document_idle",
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
  });

  test("youtube_is_covered_by_the_broad_https_grant", () => {
    expect(idsOf(settingsWith({ youtube: true }), ["https://*/*"])).toEqual([
      "lambe-youtube-main",
      "lambe-youtube",
    ]);
  });

  test("main_world_scripts_only_match_youtube", () => {
    const settings = settingsWith({
      bubbleEverywhere: true,
      youtube: true,
      sites: [{ origin: "https://example.com", autoTranslate: true, hideBubble: false }],
    });
    const everything = [
      ...desiredRegistrations(settings, ["<all_urls>"]),
      ...desiredRegistrations({ ...settings, bubbleEverywhere: false }, ["<all_urls>"]),
    ];
    const main = everything.filter((registration) => registration.world === "MAIN");

    expect(main.length).toBeGreaterThan(0);

    for (const registration of main) {
      expect(registration.matches).toEqual(YOUTUBE_MATCHES);
    }
  });

  test("site_rule_registers_the_page_script_for_its_origin_only_when_granted", () => {
    const settings = settingsWith({
      sites: [
        { origin: "https://example.com", autoTranslate: true, hideBubble: false },
        { origin: "http://localhost:3000", autoTranslate: false, hideBubble: true },
        { origin: "https://denied.org", autoTranslate: true, hideBubble: false },
      ],
    });

    const registrations = desiredRegistrations(settings, [
      "https://example.com/*",
      "http://localhost/*",
    ]);

    expect(registrations.map(({ id, js, matches }) => ({ id, js, matches }))).toEqual([
      {
        id: "lambe-site:https://example.com",
        js: [PAGE_SCRIPT],
        matches: ["https://example.com/*"],
      },
      {
        id: "lambe-site:http://localhost:3000",
        js: [PAGE_SCRIPT],
        matches: ["http://localhost/*"],
      },
    ]);
  });

  test("site_rule_is_skipped_when_the_page_script_covers_every_site", () => {
    const settings = settingsWith({
      bubbleEverywhere: true,
      sites: [{ origin: "https://example.com", autoTranslate: true, hideBubble: false }],
    });

    expect(idsOf(settings, OPTIONAL_HOSTS)).toEqual(["lambe-page"]);
  });

  test("nothing_is_registered_without_settings_or_grants", () => {
    const enabled = settingsWith({
      bubbleEverywhere: true,
      youtube: true,
      sites: [{ origin: "https://example.com", autoTranslate: true, hideBubble: false }],
    });

    expect(idsOf(settingsWith({}), ["<all_urls>"])).toEqual([]);
    expect(idsOf(enabled, [])).toEqual([]);
  });
});
