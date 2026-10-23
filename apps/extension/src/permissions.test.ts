import { describe, expect, test } from "bun:test";
import type { ScriptPublicPath } from "wxt/utils/inject-script";
import {
  LOCAL_HOSTS,
  OPTIONAL_HOSTS,
  PAGE_SCRIPT,
  YOUTUBE_CSS,
  YOUTUBE_MAIN_SCRIPT,
  YOUTUBE_MATCHES,
  YOUTUBE_SCRIPT,
} from "./permissions";

describe("permissions", () => {
  test("script_paths_exist_in_the_wxt_public_path_type", () => {
    const scripts = [PAGE_SCRIPT, YOUTUBE_SCRIPT, YOUTUBE_MAIN_SCRIPT] satisfies ScriptPublicPath[];

    expect(scripts).toEqual([
      "/content-scripts/content.js",
      "/content-scripts/youtube.js",
      "/content-scripts/youtube-timedtext.js",
    ]);
    expect(YOUTUBE_CSS).toBe("/content-scripts/youtube.css");
  });

  test("local_hosts_have_no_port", () => {
    expect(LOCAL_HOSTS.length).toBeGreaterThan(0);

    for (const host of LOCAL_HOSTS) {
      expect(host).toMatch(/^http:\/\/[^/:]+\/\*$/);
    }
  });

  test("youtube_matches_can_be_requested_from_the_optional_hosts", () => {
    for (const pattern of YOUTUBE_MATCHES) {
      const scheme = pattern.slice(0, pattern.indexOf("://"));

      expect(OPTIONAL_HOSTS).toContain(`${scheme}://*/*`);
    }
  });
});
