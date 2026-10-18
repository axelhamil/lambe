import { Result } from "@lambe/kernel/result";
import type { Block } from "../../domain/block/block";
import type { BlockTranslation } from "../../domain/block/block-translation";
import type { PageBrief } from "../../domain/page/page-brief";
import type { PageSurface, SurfaceListener, SurfaceView } from "../ports/page-surface";

export class InMemoryPageSurface implements PageSurface {
  public readonly listeners: SurfaceListener[] = [];
  public readonly translations = new Map<string, BlockTranslation>();
  public view: SurfaceView = "original";

  public constructor(
    public brief: PageBrief,
    private readonly blocks: Block[],
  ) {}

  public readBrief(): PageBrief {
    return this.brief;
  }

  public scan(): Block[] {
    return this.blocks;
  }

  public watch(listener: SurfaceListener): () => void {
    this.listeners.push(listener);

    return () => {};
  }

  public commit(translation: BlockTranslation): Result<void, { code: "BLOCK_DETACHED" }> {
    this.translations.set(translation.blockId.value, translation);

    return Result.ok();
  }

  public show(view: SurfaceView): void {
    this.view = view;
  }
}
