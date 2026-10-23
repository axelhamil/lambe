import { Option } from "@lambe/kernel/option";
import { isShowingTranslation, type ViewState } from "@lambe/translation/application/view-state";
import { YOUTUBE_SELECTORS } from "@lambe/translation/infrastructure/youtube/youtube-selectors";
import glyphSvg from "../../../../assets/tengwa-lambe.svg?raw";
import type { UiText } from "../i18n/ui-text";

export interface PlayerButton {
  render(state: ViewState): void;
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const BUTTON_CLASS = "lambe-ytp-button";
const PULSE_CLASS = "lambe-ytp-button-pulse";
const GLYPH_PATH = /\sd="([^"]+)"/.exec(glyphSvg)?.[1] ?? "";

function createButton(doc: Document, text: UiText): HTMLButtonElement {
  const button = doc.createElement("button");
  const icon = doc.createElementNS(SVG_NS, "svg");
  const glyph = doc.createElementNS(SVG_NS, "path");

  icon.setAttribute("viewBox", "0 0 32 48");
  icon.setAttribute("aria-hidden", "true");
  glyph.setAttribute("d", GLYPH_PATH);
  icon.append(glyph);
  button.type = "button";
  button.className = `ytp-button ${BUTTON_CLASS}`;
  button.setAttribute("aria-label", text.translate("youtube.button"));
  button.setAttribute("aria-pressed", "false");
  button.append(icon);

  return button;
}

function labelOf(state: ViewState, text: UiText): string {
  return text.translate(isShowingTranslation(state) ? "youtube.buttonOn" : "youtube.button");
}

function titleOf(state: ViewState, text: UiText): Option<string> {
  if (state.kind === "translating") return Option.some(text.translate("youtube.translating"));

  if (state.kind === "error") return Option.some(text.renderError(state.error));

  return Option.none();
}

export function mountPlayerButton(doc: Document, onClick: () => void, text: UiText): PlayerButton {
  const button = createButton(doc, text);
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
      const title = titleOf(state, text);

      button.setAttribute("aria-pressed", String(isShowingTranslation(state)));
      button.setAttribute("aria-label", labelOf(state, text));
      button.classList.toggle(PULSE_CLASS, state.kind === "translating");

      if (state.kind === "error") button.setAttribute("data-state", "error");
      else button.removeAttribute("data-state");

      if (title.isSome()) button.title = title.unwrap();
      else button.removeAttribute("title");
    },
    destroy() {
      observer.disconnect();
      listeners.abort();
      button.remove();
    },
  };
}
