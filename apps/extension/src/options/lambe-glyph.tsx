import { GLYPH_PATH } from "../brand/glyph-path";

export interface LambeGlyphProps {
  className?: string;
}

export function LambeGlyph({ className }: LambeGlyphProps) {
  return (
    <svg
      data-slot="glyph"
      className={className}
      viewBox="2.5 16 28.5 29"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GLYPH_PATH} />
    </svg>
  );
}
