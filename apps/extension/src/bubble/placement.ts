interface Box {
  width: number;
  height: number;
}

interface Anchor {
  left: number;
  top: number;
}

const EDGE_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.max(min, max), value));
}

export function clampTop(top: number, viewportHeight: number, height: number): number {
  return clamp(top, EDGE_GAP, viewportHeight - height - EDGE_GAP);
}

export function menuPosition(
  anchor: Anchor,
  menu: Box,
  viewport: Box,
): { left: number; top: number } {
  return {
    left: clamp(
      anchor.left - menu.width - EDGE_GAP,
      EDGE_GAP,
      viewport.width - menu.width - EDGE_GAP,
    ),
    top: clamp(anchor.top, EDGE_GAP, viewport.height - menu.height - EDGE_GAP),
  };
}
