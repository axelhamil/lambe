import type { InlineNode } from "../block/inline-node";

const BLANK = /^[ \t\n\f\r]*$/;

function isEmptyGroup(node: InlineNode): boolean {
  return (
    node.kind === "group" &&
    node.children.every(
      (child) => (child.kind === "text" && BLANK.test(child.text)) || isEmptyGroup(child),
    )
  );
}

function samePlaceholder(node: InlineNode, other: InlineNode): boolean {
  return node.kind !== "text" && node.kind === other.kind && node.key === other.key;
}

function isPlaceholder(node: InlineNode | undefined): node is InlineNode {
  return node !== undefined && node.kind !== "text";
}

function indexOf(nodes: InlineNode[], placeholder: InlineNode): number {
  return nodes.findIndex((node) => samePlaceholder(node, placeholder));
}

function insertionIndex(source: InlineNode[], index: number, nodes: InlineNode[]): number {
  const previous = source[index - 1];
  const previousAt = isPlaceholder(previous) ? indexOf(nodes, previous) : -1;

  if (previousAt >= 0) return previousAt + 1;

  const next = source[index + 1];
  const nextAt = isPlaceholder(next) ? indexOf(nodes, next) : -1;

  if (nextAt >= 0) return nextAt;

  if (index === source.length - 1) return nodes.length;

  if (index === 0) return 0;

  const following = source.slice(index + 1).find(isPlaceholder);
  const followingAt = following === undefined ? -1 : indexOf(nodes, following);

  return followingAt >= 0 ? followingAt : nodes.length;
}

export function withoutEmptyGroups(nodes: InlineNode[]): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    if (isEmptyGroup(node)) return [];

    if (node.kind !== "group") return [node];

    return [{ ...node, children: withoutEmptyGroups(node.children) }];
  });
}

export function restoreEmptyGroups(source: InlineNode[], translated: InlineNode[]): InlineNode[] {
  const restored = translated.map((node): InlineNode => {
    if (node.kind !== "group") return node;

    const origin = source.find((candidate) => samePlaceholder(candidate, node));

    if (origin?.kind !== "group") return node;

    return { ...node, children: restoreEmptyGroups(origin.children, node.children) };
  });

  return source.reduce<InlineNode[]>((nodes, node, index) => {
    if (!isEmptyGroup(node) || nodes.some((present) => samePlaceholder(present, node))) {
      return nodes;
    }

    const at = insertionIndex(source, index, nodes);

    return [...nodes.slice(0, at), node, ...nodes.slice(at)];
  }, restored);
}
