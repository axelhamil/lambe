import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { CaptionLine } from "@lambe/translation/domain/caption/caption-timeline";
import { YOUTUBE_SELECTORS } from "@lambe/translation/infrastructure/youtube/youtube-selectors";
import { mountCaptionOverlay } from "./caption-overlay";

const FIXTURE = readFileSync(
  new URL("../../../../packages/translation/fixtures/youtube/watch-player.html", import.meta.url),
  "utf8",
);

const LINES: CaptionLine[] = [
  {
    startMs: 0,
    endMs: 2000,
    original: "Rivers carve valleys.",
    text: "Les rivières creusent les vallées.",
    translated: true,
  },
  { startMs: 2000, endMs: 4000, original: "Slowly.", text: "Slowly.", translated: false },
];

const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function element(selector: string): Element {
  const found = document.querySelector(selector);

  if (found === null) throw new Error(`fixture lacks ${selector}`);

  return found;
}

function video(): HTMLVideoElement {
  const found = element(YOUTUBE_SELECTORS.video);

  if (!(found instanceof HTMLVideoElement)) throw new Error("fixture video is not a video");

  return found;
}

function host(): Element {
  return element("lambe-captions");
}

function shownText(): string[] {
  const lines = host().shadowRoot?.querySelectorAll(".line") ?? [];

  return [...lines].map((line) => line.textContent ?? "");
}

beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(FIXTURE, "text/html").body.innerHTML;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("caption overlay", () => {
  test("overlay_mounts_inside_the_player", async () => {
    const overlay = mountCaptionOverlay(document);

    expect(host().parentNode).toBe(element(YOUTUBE_SELECTORS.player));
    expect(host().shadowRoot?.querySelector("style")?.textContent).toContain(":host");

    host().remove();
    await flushMutations();

    expect(host().parentNode).toBe(element(YOUTUBE_SELECTORS.player));

    overlay.destroy();

    expect(document.querySelector("lambe-captions")).toBeNull();
  });

  test("overlay_shows_active_lines_at_current_time", () => {
    const overlay = mountCaptionOverlay(document);

    video().currentTime = 1;
    overlay.update(LINES);

    expect(shownText()).toEqual(["Les rivières creusent les vallées."]);

    video().currentTime = 3;
    video().dispatchEvent(new Event("seeked"));

    expect(shownText()).toEqual(["Slowly."]);

    overlay.destroy();
  });

  test("overlay_lifts_when_controls_show", async () => {
    const overlay = mountCaptionOverlay(document);

    expect(host().getAttribute("data-controls")).toBe("hidden");

    element(YOUTUBE_SELECTORS.player).classList.remove(YOUTUBE_SELECTORS.autohideClass);
    await flushMutations();

    expect(host().getAttribute("data-controls")).toBe("shown");

    overlay.destroy();
  });

  test("overlay_is_hidden_while_an_ad_shows", async () => {
    const overlay = mountCaptionOverlay(document);

    expect(host().hasAttribute("data-ad")).toBe(false);

    element(YOUTUBE_SELECTORS.player).classList.add(YOUTUBE_SELECTORS.adShowingClass);
    await flushMutations();

    expect(host().hasAttribute("data-ad")).toBe(true);
    expect(host().shadowRoot?.querySelector("style")?.textContent).toMatch(
      /:host\(\[data-ad\]\)\s*\{\s*display: none;/,
    );

    element(YOUTUBE_SELECTORS.player).classList.remove(YOUTUBE_SELECTORS.adShowingClass);
    await flushMutations();

    expect(host().hasAttribute("data-ad")).toBe(false);

    overlay.destroy();
  });

  test("clear_empties_the_overlay", () => {
    const overlay = mountCaptionOverlay(document);

    video().currentTime = 1;
    overlay.update(LINES);
    overlay.clear();

    expect(shownText()).toEqual([]);

    video().dispatchEvent(new Event("seeked"));

    expect(shownText()).toEqual([]);

    overlay.destroy();
  });
});
