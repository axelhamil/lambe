import type { CaptionLine } from "../../domain/caption/caption-timeline";

export interface CaptionDisplay {
  update(lines: CaptionLine[]): void;
  clear(): void;
}
