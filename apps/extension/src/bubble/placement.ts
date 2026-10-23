export type Side = "left" | "right";

const MIN_TOP = 40;
const BOTTOM_GAP = 6;

export function snapSide(centerX: number, viewportWidth: number): Side {
  return centerX < viewportWidth / 2 ? "left" : "right";
}

export function clampTop(top: number, viewportHeight: number, size: number): number {
  return Math.max(MIN_TOP, Math.min(viewportHeight - size - BOTTOM_GAP, top));
}

export function restingLeft(side: Side, viewportWidth: number, size: number, margin = 4): number {
  return side === "left" ? margin : viewportWidth - size - margin;
}

interface Box {
  width: number;
  height: number;
}

interface Anchor {
  left: number;
  right: number;
  top: number;
}

const MENU_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.max(min, max), value));
}

export function menuPosition(
  anchor: Anchor,
  menu: Box,
  viewport: Box,
): { left: number; top: number } {
  const side = snapSide((anchor.left + anchor.right) / 2, viewport.width);
  const left = side === "left" ? anchor.right + MENU_GAP : anchor.left - menu.width - MENU_GAP;

  return {
    left: clamp(left, MENU_GAP, viewport.width - menu.width - MENU_GAP),
    top: clamp(anchor.top, MENU_GAP, viewport.height - menu.height - MENU_GAP),
  };
}
