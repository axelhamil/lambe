import { isShowingTranslation, type ViewState } from "@lambe/translation/application/view-state";
import { YOUTUBE_SELECTORS } from "@lambe/translation/infrastructure/youtube/youtube-selectors";
import glyphSvg from "../../../../assets/tengwa-lambe.svg?raw";

export interface PlayerButton {
  render(state: ViewState): void;
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const LABEL = "Translated captions (Lambë)";
const BUTTON_CLASS = "lambe-ytp-button";
const PULSE_CLASS = "lambe-ytp-button-pulse";
const GLYPH_PATH = /\sd="([^"]+)"/.exec(glyphSvg)?.[1] ?? "";

function createButton(doc: Document): HTMLButtonElement {
  const button = doc.createElement("button");
  const icon = doc.createElementNS(SVG_NS, "svg");
  const glyph = doc.createElementNS(SVG_NS, "path");

  icon.setAttribute("viewBox", "0 0 32 48");
  icon.setAttribute("aria-hidden", "true");
  glyph.setAttribute("d", GLYPH_PATH);
  icon.append(glyph);
  button.type = "button";
  button.className = `ytp-button ${BUTTON_CLASS}`;
  button.setAttribute("aria-label", LABEL);
  button.setAttribute("aria-pressed", "false");
  button.append(icon);

  return button;
}

export function mountPlayerButton(doc: Document, onClick: () => void): PlayerButton {
  const button = createButton(doc);
  const listeners = new AbortController();

  const place = (): void => {
    const subtitles = doc.querySelector(YOUTUBE_SELECTORS.subtitlesButton);

    if (subtitles === null || subtitles.previousElementSibling === button) return;

    subtitles.before(button);
  };

  const observer = new MutationObserver(place);

  button.addEventListener("click", () => onClick(), { signal: listeners.signal });
  observer.observe(doc.querySelector(YOUTUBE_SELECTORS.player) ?? doc.documentElement, {
    childList: true,
    subtree: true,
  });
  place();

  return {
    render(state) {
      button.setAttribute("aria-pressed", String(isShowingTranslation(state)));
      button.classList.toggle(PULSE_CLASS, state.kind === "translating");

      if (state.kind !== "error") {
        button.removeAttribute("data-state");
        button.removeAttribute("title");

        return;
      }

      button.setAttribute("data-state", "error");
      button.title = state.error.message;
    },
    destroy() {
      observer.disconnect();
      listeners.abort();
      button.remove();
    },
  };
}
