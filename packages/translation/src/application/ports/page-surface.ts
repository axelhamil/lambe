import type { Option } from "@lambe/kernel/option";
import type { Result } from "@lambe/kernel/result";
import type { Block } from "../../domain/block/block";
import type { BlockTranslation } from "../../domain/block/block-translation";
import type { BlockId } from "../../domain/block/value-objects/block-id.vo";
import type { PageBrief } from "../../domain/page/page-brief";
import type { ProximityRank } from "../../domain/queue/translation-queue";

export type SurfaceView = "original" | "translated";

export interface SurfaceListener {
  onBlocks(blocks: Block[]): void;
  onProximity(id: BlockId, rank: Option<ProximityRank>): void;
}

export interface PageSurface {
  readBrief(): PageBrief;
  scan(): Block[];
  watch(listener: SurfaceListener): () => void;
  commit(translation: BlockTranslation): Result<void, { code: "BLOCK_DETACHED" }>;
  show(view: SurfaceView): void;
}
