import type { ViewState } from "@lambe/translation/application/page-translation.service";
import glyphSvg from "../../../../assets/tengwa-lambe.svg?raw";
import type { UiText } from "../i18n/ui-text";
import { type BubbleClass, bubbleStateOf } from "./bubble-state";
import { type ClickHandlers, createClickClassifier, type Scheduler } from "./click-classifier";
import { clampTop, restingLeft, type Side, snapSide } from "./placement";

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
  originLeft: number;
  originTop: number;
  moved: boolean;
}

export const BUBBLE_SELECTOR = "button.bubble";

const SVG_NS = "http://www.w3.org/2000/svg";
const DRAG_THRESHOLD = 4;
const INITIAL_TOP = 150;
const ICON_LETTERS = "Aa";
const OUTLINE_PATH =
  "M9 7h22a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-1l5 6-9-6H9a5 5 0 0 1-5-5V12a5 5 0 0 1 5-5z";
const GLYPH_PATH = /\sd="([^"]+)"/.exec(glyphSvg)?.[1] ?? "";
const STATE_CLASSES: BubbleClass[] = ["on", "busy", "error"];

function svgElement(name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, name);

  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);

  return element;
}

function createButton(text: UiText): HTMLButtonElement {
  const button = document.createElement("button");
  const icon = svgElement("svg", { viewBox: "0 0 40 40", "aria-hidden": "true" });
  const label = svgElement("text", { class: "label", x: "20", y: "21.5", "text-anchor": "middle" });

  label.textContent = ICON_LETTERS;
  icon.append(
    svgElement("path", { class: "outline", d: OUTLINE_PATH }),
    label,
    svgElement("path", {
      class: "glyph",
      transform: "translate(9.6,-0.9) scale(0.6)",
      d: GLYPH_PATH,
    }),
  );
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
  let side: Side = "right";
  let left = 0;
  let top = INITIAL_TOP;
  let drag: Drag | undefined;

  const moveTo = (x: number, y: number): void => {
    left = x;
    top = y;
    button.style.setProperty("--lambe-left", `${x}px`);
    button.style.setProperty("--lambe-top", `${y}px`);
  };

  const size = (): number => button.getBoundingClientRect().width;

  const sideUnderCenter = (): Side => snapSide(left + size() / 2, viewport().width);

  const place = (): void => {
    const { width, height } = viewport();

    button.classList.toggle("left", side === "left");
    moveTo(restingLeft(side, width, size()), clampTop(top, height, size()));
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
        originLeft: left,
        originTop: top,
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
      moveTo(drag.originLeft + dx, drag.originTop + dy);
      button.classList.toggle("left", sideUnderCenter() === "left");
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

      side = sideUnderCenter();
      place();
    },
    options,
  );

  button.addEventListener(
    "pointercancel",
    () => {
      endDrag();
      place();
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
