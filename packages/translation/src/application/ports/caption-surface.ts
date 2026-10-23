import type { Option } from "@lambe/kernel/option";
import type { CaptionBrief } from "../../domain/caption/caption-brief";
import type { CaptionTrack } from "../../domain/caption/caption-track";
import type { VideoId } from "../../domain/caption/value-objects/video-id.vo";

export interface CaptionSurfaceListener {
  onTrack(track: CaptionTrack): void;
  onPlayhead(ms: Option<number>, seeked: boolean): void;
  onNavigate(videoId: Option<VideoId>): void;
  onCaptionsOff(): void;
}

export interface CaptionSurface {
  videoId(): Option<VideoId>;
  playheadMs(): Option<number>;
  readBrief(): Omit<CaptionBrief, "generated" | "preceding">;
  watch(listener: CaptionSurfaceListener): () => void;
  loadCaptions(): void;
  restoreCaptions(): void;
  hideNative(hidden: boolean): void;
}
