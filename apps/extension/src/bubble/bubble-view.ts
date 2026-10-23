import type { ViewState } from "@lambe/translation/application/page-translation.service";
import { GLYPH_PATH } from "../brand/glyph-path";
import type { UiText } from "../i18n/ui-text";
import { type BubbleClass, bubbleStateOf } from "./bubble-state";
import { type ClickHandlers, createClickClassifier, type Scheduler } from "./click-classifier";
import { clampTop } from "./placement";

export interface BubbleHandlers extends ClickHandlers {
  onMenu(anchor: DOMRect): void;
}

export interface Bubble {
  render(state: ViewState): void;
  destroy(): void;
}

interface Drag {
  startX: number;
  startY: number;
  originTop: number;
  moved: boolean;
}

export const BUBBLE_SELECTOR = "button.bubble";

const SVG_NS = "http://www.w3.org/2000/svg";
const DRAG_THRESHOLD = 4;
const INITIAL_TOP = 150;
const STATE_CLASSES: BubbleClass[] = ["on", "busy", "error", "unavailable"];

function createButton(text: UiText): HTMLButtonElement {
  const button = document.createElement("button");
  const icon = document.createElementNS(SVG_NS, "svg");
  const glyph = document.createElementNS(SVG_NS, "path");

  icon.setAttribute("viewBox", "1.7 15.6 30 30");
  icon.setAttribute("aria-hidden", "true");
  glyph.setAttribute("d", GLYPH_PATH);
  icon.append(glyph);
  button.type = "button";
  button.className = "bubble";
  button.setAttribute("aria-label", text.translate("bubble.translate"));
  button.setAttribute("aria-description", text.translate("bubble.dragHint"));
  button.setAttribute("aria-pressed", "false");
  button.append(icon);

  return button;
}

export function viewport(): { width: number; height: number } {
  const layout = document.documentElement;

  return {
    width: layout.clientWidth || window.innerWidth,
    height: layout.clientHeight || window.innerHeight,
  };
}

export function mountBubble(root: ShadowRoot, handlers: BubbleHandlers, text: UiText): Bubble {
  const button = createButton(text);
  const listeners = new AbortController();
  const timers = new Set<number>();
  const scheduler: Scheduler = {
    set(cb, ms) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        cb();
      }, ms);

      timers.add(id);

      return id;
    },
    clear(id) {
      timers.delete(id);
      window.clearTimeout(id);
    },
  };
  const classifier = createClickClassifier(scheduler, handlers);
  let wantedTop = INITIAL_TOP;
  let shownTop = INITIAL_TOP;
  let drag: Drag | undefined;

  const place = (): void => {
    shownTop = clampTop(wantedTop, viewport().height, button.getBoundingClientRect().height);
    button.style.setProperty("--lambe-top", `${shownTop}px`);
  };

  const moveTo = (y: number): void => {
    wantedTop = y;
    place();
  };

  const endDrag = (): Drag | undefined => {
    const finished = drag;

    drag = undefined;
    button.classList.remove("dragging");

    return finished;
  };

  const options = { signal: listeners.signal };

  button.addEventListener(
    "pointerdown",
    (event) => {
      event.stopPropagation();

      if (event.button !== 0) return;

      drag = {
        startX: event.clientX,
        startY: event.clientY,
        originTop: shownTop,
        moved: false,
      };

      if (button.isConnected) button.setPointerCapture(event.pointerId);
    },
    options,
  );

  button.addEventListener("mousedown", (event) => event.preventDefault(), options);

  button.addEventListener(
    "pointermove",
    (event) => {
      if (drag === undefined) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      drag.moved = true;
      button.classList.add("dragging");
      moveTo(drag.originTop + dy);
    },
    options,
  );

  button.addEventListener(
    "pointerup",
    (event) => {
      event.stopPropagation();

      const finished = endDrag();

      if (finished === undefined) return;

      if (!finished.moved) {
        classifier.pointerUp();

        return;
      }

      moveTo(shownTop);
    },
    options,
  );

  button.addEventListener(
    "pointercancel",
    () => {
      const cancelled = endDrag();

      if (cancelled === undefined) return;

      moveTo(cancelled.originTop);
    },
    options,
  );

  button.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      if (event.detail === 0) handlers.onSingle();
    },
    options,
  );

  button.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onMenu(button.getBoundingClientRect());
    },
    options,
  );

  window.addEventListener("resize", place, options);
  root.append(button);
  place();

  return {
    render(state) {
      const view = bubbleStateOf(state, text);

      for (const name of STATE_CLASSES) button.classList.toggle(name, view.classes.includes(name));

      button.setAttribute("aria-pressed", String(state.kind === "translated"));
      button.setAttribute("aria-busy", String(state.kind === "translating"));
      button.setAttribute("aria-label", view.label);

      if (view.tooltip.isSome()) button.title = view.tooltip.unwrap();
      else button.removeAttribute("title");
    },
    destroy() {
      listeners.abort();

      for (const id of timers) window.clearTimeout(id);

      timers.clear();
      button.remove();
    },
  };
}
