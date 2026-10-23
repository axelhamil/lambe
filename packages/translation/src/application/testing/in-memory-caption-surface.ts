import type { Option } from "@lambe/kernel/option";
import type { CaptionBrief } from "../../domain/caption/caption-brief";
import type { VideoId } from "../../domain/caption/value-objects/video-id.vo";
import type { CaptionSurface, CaptionSurfaceListener } from "../ports/caption-surface";

export class InMemoryCaptionSurface implements CaptionSurface {
  public readonly listeners = new Set<CaptionSurfaceListener>();
  public loads = 0;
  public restores = 0;
  public nativeHidden = false;

  public constructor(
    public video: Option<VideoId>,
    public playhead: Option<number>,
    public brief: Omit<CaptionBrief, "generated" | "preceding">,
  ) {}

  public videoId(): Option<VideoId> {
    return this.video;
  }

  public playheadMs(): Option<number> {
    return this.playhead;
  }

  public readBrief(): Omit<CaptionBrief, "generated" | "preceding"> {
    return this.brief;
  }

  public watch(listener: CaptionSurfaceListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public loadCaptions(): void {
    this.loads += 1;
  }

  public restoreCaptions(): void {
    this.restores += 1;
  }

  public hideNative(hidden: boolean): void {
    this.nativeHidden = hidden;
  }
}
