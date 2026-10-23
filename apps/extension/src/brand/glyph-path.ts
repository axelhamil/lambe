import glyphSvg from "../../../../assets/tengwa-lambe.svg?raw";

export const GLYPH_PATH = /\sd="([^"]+)"/.exec(glyphSvg)?.[1] ?? "";
