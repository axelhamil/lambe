import { isShowingTranslation, type ViewState } from "@lambe/translation/application/view-state";
import { YOUTUBE_SELECTORS } from "@lambe/translation/infrastructure/youtube/youtube-selectors";
import { GLYPH_PATH } from "../brand/glyph-path";
import type { UiText } from "../i18n/ui-text";

export interface PlayerButton {
  render(state: ViewState): void;
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const BUTTON_CLASS = "lambe-ytp-button";
const PULSE_CLASS = "lambe-ytp-button-pulse";
const TOOLTIP_CLASS = "lambe-ytp-tooltip";
const MASK_ID = "lambe-ytp-glyph-cutout";
const TOOLTIP_GAP = 22;
const TOOLTIP_EDGE = 12;
const FRAME_PATH = "M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z";
const FRAME_OUTLINE_PATH = `${FRAME_PATH}M3 5v14h18V5z`;
const GLYPH_TRANSFORM = "translate(12 12) scale(0.5) translate(-16.71 -30.57)";
const GLYPH_STROKE_WIDTH = "1.5";

function svgElement(doc: Document, name: string, attributes: Record<string, string>): SVGElement {
  const element = doc.createElementNS(SVG_NS, name);

  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);

  return element;
}

function glyphPath(doc: Document, ink: string, className?: string): SVGElement {
  const path = svgElement(doc, "path", {
    d: GLYPH_PATH,
    transform: GLYPH_TRANSFORM,
    fill: ink,
    stroke: ink,
    "stroke-width": GLYPH_STROKE_WIDTH,
    "stroke-linejoin": "round",
  });

  if (className) path.setAttribute("class", className);

  return path;
}

function createIcon(doc: Document): SVGElement {
  const icon = svgElement(doc, "svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
  });
  const defs = svgElement(doc, "defs", {});
  const mask = svgElement(doc, "mask", { id: MASK_ID });

  mask.append(
    svgElement(doc, "rect", { width: "24", height: "24", fill: "white" }),
    glyphPath(doc, "black"),
  );
  defs.append(mask);
  icon.append(
    defs,
    svgElement(doc, "path", {
      class: "lambe-ytp-off",
      d: FRAME_OUTLINE_PATH,
      "fill-rule": "evenodd",
      fill: "white",
    }),
    glyphPath(doc, "white", "lambe-ytp-off lambe-ytp-glyph"),
    svgElement(doc, "path", {
      class: "lambe-ytp-on",
      d: FRAME_PATH,
      mask: `url(#${MASK_ID})`,
      fill: "white",
    }),
  );

  return icon;
}

function createButton(doc: Document, text: UiText): HTMLButtonElement {
  const button = doc.createElement("button");
  const label = text.translate("youtube.button");

  button.type = "button";
  button.className = `ytp-button ${BUTTON_CLASS}`;
  button.setAttribute("aria-label", label);
  button.setAttribute("data-title-no-tooltip", label);
  button.setAttribute("aria-pressed", "false");
  button.append(createIcon(doc));

  return button;
}

function labelOf(state: ViewState, text: UiText): string {
  return text.translate(isShowingTranslation(state) ? "youtube.buttonOn" : "youtube.button");
}

function hintOf(state: ViewState, text: UiText): string {
  if (state.kind === "translating") return text.translate("youtube.translating");

  if (state.kind === "error") return text.renderError(state.error);

  return labelOf(state, text);
}

function createTooltip(doc: Document): HTMLElement {
  const tooltip = doc.createElement("div");

  tooltip.className = TOOLTIP_CLASS;
  tooltip.hidden = true;
  tooltip.setAttribute("aria-hidden", "true");

  return tooltip;
}

export function mountPlayerButton(doc: Document, onClick: () => void, text: UiText): PlayerButton {
  const button = createButton(doc, text);
  const tooltip = createTooltip(doc);
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let hint = text.translate("youtube.button");
  let failed = false;

  const place = (): void => {
    const subtitles = doc.querySelector(YOUTUBE_SELECTORS.subtitlesButton);

    if (subtitles === null || subtitles.previousElementSibling === button) return;

    subtitles.before(button);
  };

  const showTooltip = (): void => {
    const player = button.closest(YOUTUBE_SELECTORS.player);

    if (player === null) return;

    if (tooltip.parentElement !== player) player.append(tooltip);

    tooltip.textContent = hint;
    tooltip.style.setProperty("--lambe-ytp-tooltip-left", "0px");

    if (failed) tooltip.setAttribute("data-state", "error");
    else tooltip.removeAttribute("data-state");

    tooltip.hidden = false;

    const frame = player.getBoundingClientRect();
    const anchor = button.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const center = anchor.left + anchor.width / 2 - frame.left;
    const left = Math.max(
      TOOLTIP_EDGE,
      Math.min(frame.width - width - TOOLTIP_EDGE, center - width / 2),
    );

    tooltip.style.setProperty("--lambe-ytp-tooltip-left", `${left}px`);
    tooltip.style.setProperty(
      "--lambe-ytp-tooltip-top",
      `${anchor.top - frame.top - TOOLTIP_GAP - tooltip.offsetHeight}px`,
    );
  };

  const hideTooltip = (): void => {
    tooltip.hidden = true;
  };

  const observer = new MutationObserver(place);

  button.addEventListener("click", () => onClick(), options);
  button.addEventListener("mouseenter", showTooltip, options);
  button.addEventListener("focus", showTooltip, options);
  button.addEventListener("mouseleave", hideTooltip, options);
  button.addEventListener("blur", hideTooltip, options);
  observer.observe(doc.querySelector(YOUTUBE_SELECTORS.player) ?? doc.documentElement, {
    childList: true,
    subtree: true,
  });
  place();

  return {
    render(state) {
      const label = labelOf(state, text);

      hint = hintOf(state, text);
      failed = state.kind === "error";
      button.setAttribute("aria-pressed", String(isShowingTranslation(state)));
      button.setAttribute("aria-label", label);
      button.setAttribute("data-title-no-tooltip", label);
      button.classList.toggle(PULSE_CLASS, state.kind === "translating");

      if (failed) {
        button.setAttribute("data-state", "error");
        button.setAttribute("aria-description", hint);
      } else {
        button.removeAttribute("data-state");
        button.removeAttribute("aria-description");
      }

      if (!tooltip.hidden) showTooltip();
    },
    destroy() {
      observer.disconnect();
      listeners.abort();
      button.remove();
      tooltip.remove();
    },
  };
}
