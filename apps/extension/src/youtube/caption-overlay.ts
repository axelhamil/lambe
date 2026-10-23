import type { CaptionDisplay } from "@lambe/translation/application/ports/caption-display";
import { activeLines, type CaptionLine } from "@lambe/translation/domain/caption/caption-timeline";
import { YOUTUBE_SELECTORS } from "@lambe/translation/infrastructure/youtube/youtube-selectors";
import overlayCss from "./caption-overlay.css?raw";

export interface CaptionOverlay extends CaptionDisplay {
  destroy(): void;
}

interface Binding {
  player: Element;
  release(): void;
}

const HOST_TAG = "lambe-captions";
const PLAY_EVENTS = ["play", "playing"];
const STILL_EVENTS = ["pause", "seeked"];
const CONTROL_BARS = [
  YOUTUBE_SELECTORS.chromeBottom,
  YOUTUBE_SELECTORS.fullscreenQuickActions,
].join(", ");
const LIFT_PROPERTY = "--lambe-controls-lift";

function controlsLift(player: Element): number {
  const bottom = player.getBoundingClientRect().bottom;
  const tops = [...player.querySelectorAll(CONTROL_BARS)]
    .map((bar) => bar.getBoundingClientRect())
    .filter((rect) => rect.height > 0)
    .map((rect) => rect.top);

  return tops.length === 0 ? 0 : Math.max(0, Math.round(bottom - Math.min(...tops)));
}

export function mountCaptionOverlay(doc: Document): CaptionOverlay {
  const host = doc.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  const box = doc.createElement("div");
  let lines: CaptionLine[] = [];
  let shown = "";
  let frame: number | undefined;
  let binding: Binding | undefined;

  style.textContent = overlayCss;
  box.className = "captions";
  root.append(style, box);

  const video = (): HTMLVideoElement | undefined => {
    const found = binding?.player.querySelector(YOUTUBE_SELECTORS.video);

    return found instanceof HTMLVideoElement ? found : undefined;
  };

  const playing = (): boolean => {
    const current = video();

    return current !== undefined && !current.paused && !current.ended;
  };

  const mirror = (player: Element): void => {
    const autohide = player.classList.contains(YOUTUBE_SELECTORS.autohideClass);

    host.setAttribute("data-controls", autohide ? "hidden" : "shown");
    host.style.setProperty(LIFT_PROPERTY, `${controlsLift(player)}px`);
    host.toggleAttribute("data-ad", player.classList.contains(YOUTUBE_SELECTORS.adShowingClass));
  };

  const attach = (player: Element): void => {
    if (host.parentNode !== player) player.append(host);
  };

  const bind = (): void => {
    const player = doc.querySelector(YOUTUBE_SELECTORS.player);

    if (player === null) return;

    if (binding?.player === player) {
      attach(player);

      return;
    }

    binding?.release();

    const listeners = new AbortController();
    const options = { capture: true, signal: listeners.signal };
    const observer = new MutationObserver(() => {
      mirror(player);
      attach(player);
    });
    const resizes = new ResizeObserver(() => mirror(player));

    for (const type of PLAY_EVENTS) player.addEventListener(type, startLoop, options);
    for (const type of STILL_EVENTS) player.addEventListener(type, render, options);

    observer.observe(player, { attributes: true, attributeFilter: ["class"], childList: true });
    resizes.observe(player);
    binding = {
      player,
      release() {
        listeners.abort();
        observer.disconnect();
        resizes.disconnect();
      },
    };
    attach(player);
    mirror(player);
  };

  const render = (): void => {
    bind();

    const current = video();
    const active = current === undefined ? [] : activeLines(lines, current.currentTime * 1000);
    const key = active.map((line) => line.text).join("\n");

    if (key === shown) return;

    shown = key;
    box.replaceChildren(
      ...active.map((line) => {
        const element = doc.createElement("div");

        element.className = "line";
        element.textContent = line.text;

        return element;
      }),
    );
  };

  const tick = (): void => {
    frame = undefined;
    render();

    if (playing()) frame = window.requestAnimationFrame(tick);
  };

  const startLoop = (): void => {
    if (frame !== undefined) return;

    frame = window.requestAnimationFrame(tick);
  };

  const stopLoop = (): void => {
    if (frame === undefined) return;

    window.cancelAnimationFrame(frame);
    frame = undefined;
  };

  bind();

  return {
    update(next) {
      lines = next;
      render();

      if (playing()) startLoop();
    },
    clear() {
      lines = [];
      stopLoop();
      render();
    },
    destroy() {
      stopLoop();
      binding?.release();
      binding = undefined;
      host.remove();
    },
  };
}
