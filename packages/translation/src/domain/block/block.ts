import type { InlineNode } from "./inline-node";
import type { BlockId } from "./value-objects/block-id.vo";

export type BlockRole = "article" | "content" | "chrome";

export interface Block {
  id: BlockId;
  nodes: InlineNode[];
  role: BlockRole;
}
