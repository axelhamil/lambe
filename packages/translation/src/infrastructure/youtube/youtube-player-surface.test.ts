import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Option } from "@lambe/kernel/option";
import type { CaptionSurfaceListener } from "../../application/ports/caption-surface";
import type { CaptionTrack } from "../../domain/caption/caption-track";
import type { VideoId } from "../../domain/caption/value-objects/video-id.vo";
import { createTimedtextRelay } from "./timedtext-relay";
import { YoutubePlayerSurface } from "./youtube-player-surface";
import { YOUTUBE_SELECTORS } from "./youtube-selectors";

const VIDEO = "dQw4w9WgXcQ";

const OTHER_VIDEO = "a-b_C1d2E3f";

const FIXTURE = readFileSync(
  new URL("../../../fixtures/youtube/watch-player.html", import.meta.url),
  "utf8",
);

const TRACK_BODY = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: "Rivers carve valleys." }] }],
});

const timedtextUrl = (video: string): string =>
  `https://www.youtube.com/api/timedtext?v=${video}&lang=en&fmt=json3`;

interface Recorded {
  tracks: CaptionTrack[];
  playheads: [Option<number>, boolean][];
  navigations: Option<VideoId>[];
  captionsOff: number;
}

const recorder = (): { listener: CaptionSurfaceListener; recorded: Recorded } => {
  const recorded: Recorded = { tracks: [], playheads: [], navigations: [], captionsOff: 0 };

  return {
    recorded,
    listener: {
      onTrack: (track) => recorded.tracks.push(track),
      onPlayhead: (ms, seeked) => recorded.playheads.push([ms, seeked]),
      onNavigate: (videoId) => recorded.navigations.push(videoId),
      onCaptionsOff: () => {
        recorded.captionsOff += 1;
      },
    },
  };
};

const visit = (path: string): void => {
  window.location.href = "https://www.youtube.com/";
  window.history.replaceState(null, "", path);
};

const watchPage = (path = `/watch?v=${VIDEO}`) => {
  visit(path);
  const doc = new DOMParser().parseFromString(FIXTURE, "text/html");
  const surface = new YoutubePlayerSurface({ doc, window });
  const element = (selector: string): Element => {
    const found = doc.querySelector(selector);

    if (found === null) throw new Error(`fixture lacks ${selector}`);

    return found;
  };

  return { doc, surface, element };
};

const simulateYoutubeCcButton = (button: Element): { clicks: () => number } => {
  let clicks = 0;
  button.addEventListener("click", () => {
    clicks += 1;
    const pressed = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!pressed));
  });

  return { clicks: () => clicks };
};

const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const plainPlayhead = (playhead: [Option<number>, boolean]): [number | undefined, boolean] => [
  playhead[0].toUndefined(),
  playhead[1],
];

describe("YoutubePlayerSurface", () => {
  let debug: ReturnType<typeof spyOn>;

  beforeEach(() => {
    debug = spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    debug.mockRestore();
  });

  test("reads_video_id_title_channel_and_description", () => {
    const { surface } = watchPage(`/watch?v=${VIDEO}&t=42s`);

    expect(
      surface
        .videoId()
        .map((id) => id.value)
        .toUndefined(),
    ).toBe(VIDEO);
    expect(surface.readBrief()).toEqual({
      kind: "captions",
      host: "www.youtube.com",
      url: `https://www.youtube.com/watch?v=${VIDEO}&t=42s`,
      title: "How rivers shape valleys",
      channel: "Earth Lab",
      description: "A short look at how water carves the land over thousands of years.",
    });
  });

  test("brief_ignores_metadata_of_the_previous_video", () => {
    const { surface } = watchPage(`/watch?v=${OTHER_VIDEO}`);

    expect(surface.readBrief()).toEqual({
      kind: "captions",
      host: "www.youtube.com",
      url: `https://www.youtube.com/watch?v=${OTHER_VIDEO}`,
      title: "",
      channel: "",
      description: "",
    });
  });

  test("non_watch_page_has_no_video_id", () => {
    for (const path of [`/results?search_query=rivers&v=${VIDEO}`, `/shorts/${VIDEO}`, "/watch"]) {
      const { surface } = watchPage(path);

      expect(surface.videoId().isNone()).toBe(true);
    }
  });

  test("ad_showing_reports_no_playhead", () => {
    const { surface, element } = watchPage();
    const { listener, recorded } = recorder();
    const video = element(YOUTUBE_SELECTORS.video);
    surface.watch(listener);
    if (video instanceof HTMLVideoElement) video.currentTime = 12.5;

    video.dispatchEvent(new Event("timeupdate"));
    element(YOUTUBE_SELECTORS.player).classList.add("ad-showing");
    video.dispatchEvent(new Event("timeupdate"));

    expect(recorded.playheads.map(plainPlayhead)).toEqual([
      [12500, false],
      [undefined, false],
    ]);
    expect(surface.playheadMs().isNone()).toBe(true);
  });

  test("seeked_is_flagged", () => {
    const { surface, element } = watchPage();
    const { listener, recorded } = recorder();
    const video = element(YOUTUBE_SELECTORS.video);
    surface.watch(listener);

    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("seeked"));

    expect(recorded.playheads.map(plainPlayhead)).toEqual([
      [0, false],
      [0, true],
    ]);
  });

  test("navigate_finish_reports_the_new_video", () => {
    const { doc, surface } = watchPage();
    const { listener, recorded } = recorder();
    surface.watch(listener);

    window.history.replaceState(null, "", `/watch?v=${OTHER_VIDEO}`);
    doc.dispatchEvent(new Event("yt-navigate-finish"));
    window.history.replaceState(null, "", "/");
    doc.dispatchEvent(new Event("yt-navigate-finish"));

    expect(recorded.navigations.map((id) => id.map((value) => value.value).toUndefined())).toEqual([
      OTHER_VIDEO,
      undefined,
    ]);
  });

  test("track_of_another_video_is_dropped", () => {
    const { doc, surface } = watchPage();
    const { listener, recorded } = recorder();
    const relay = createTimedtextRelay(doc);
    relay.publish({ url: timedtextUrl(OTHER_VIDEO), body: TRACK_BODY });
    surface.watch(listener);

    relay.publish({ url: timedtextUrl(VIDEO), body: "not json" });
    relay.publish({ url: timedtextUrl(VIDEO), body: TRACK_BODY });

    expect(recorded.tracks.map((track) => track.videoId.value)).toEqual([VIDEO]);
    expect(recorded.tracks[0]?.units).toEqual([
      { text: "Rivers carve valleys.", startMs: 0, endMs: 1500 },
    ]);
  });

  test("load_captions_clicks_cc_only_when_off_and_restore_undoes_it", async () => {
    const off = watchPage();
    const offButton = off.element(YOUTUBE_SELECTORS.subtitlesButton);
    const offCc = simulateYoutubeCcButton(offButton);
    const { listener, recorded } = recorder();
    off.surface.watch(listener);

    off.surface.loadCaptions();
    off.surface.loadCaptions();
    expect(offButton.getAttribute("aria-pressed")).toBe("true");
    off.surface.restoreCaptions();
    await flushMutations();

    expect(offCc.clicks()).toBe(2);
    expect(offButton.getAttribute("aria-pressed")).toBe("false");
    expect(recorded.captionsOff).toBe(0);

    const on = watchPage();
    const onButton = on.element(YOUTUBE_SELECTORS.subtitlesButton);
    onButton.setAttribute("aria-pressed", "true");
    const onCc = simulateYoutubeCcButton(onButton);

    on.surface.loadCaptions();
    on.surface.restoreCaptions();

    expect(onCc.clicks()).toBe(0);
    expect(onButton.getAttribute("aria-pressed")).toBe("true");
  });

  test("user_turning_cc_off_is_reported", async () => {
    const { surface, element } = watchPage();
    const button = element(YOUTUBE_SELECTORS.subtitlesButton);
    const cc = simulateYoutubeCcButton(button);
    const { listener, recorded } = recorder();
    surface.watch(listener);
    surface.loadCaptions();
    await flushMutations();

    if (button instanceof HTMLElement) button.click();
    await flushMutations();
    surface.restoreCaptions();

    expect(recorded.captionsOff).toBe(1);
    expect(cc.clicks()).toBe(2);
  });

  test("hide_native_hides_the_caption_container", () => {
    const { doc, surface, element } = watchPage();
    const container = element(YOUTUBE_SELECTORS.captionContainer);

    surface.hideNative(true);
    surface.hideNative(true);

    expect(window.getComputedStyle(container).display).toBe("none");
    expect(doc.querySelectorAll("style#lambe-youtube").length).toBe(1);

    surface.hideNative(false);

    expect(window.getComputedStyle(container).display).not.toBe("none");
  });
});
