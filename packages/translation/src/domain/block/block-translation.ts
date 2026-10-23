import type { InlineNode } from "./inline-node";
import type { BlockId } from "./value-objects/block-id.vo";

export type BlockTranslation =
  | { blockId: BlockId; kind: "structured"; nodes: InlineNode[] }
  | { blockId: BlockId; kind: "text-slots"; texts: string[] };

export function textSlots(nodes: InlineNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.kind === "text") return [node.text];

    if (node.kind === "group") return textSlots(node.children);

    return [];
  });
}

export function textNodeCount(nodes: InlineNode[]): number {
  return textSlots(nodes).length;
}

const LETTER = /\p{L}/gu;

export function letterCount(nodes: InlineNode[]): number {
  return textSlots(nodes).join("").match(LETTER)?.length ?? 0;
}
