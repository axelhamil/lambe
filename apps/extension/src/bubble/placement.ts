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
