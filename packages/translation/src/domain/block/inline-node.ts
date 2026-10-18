export interface TextNode {
  kind: "text";
  text: string;
}

export interface AtomNode {
  kind: "atom";
  key: number;
}

export interface GroupNode {
  kind: "group";
  key: number;
  children: InlineNode[];
}

export type InlineNode = TextNode | AtomNode | GroupNode;

export function appendNode(nodes: InlineNode[], node: InlineNode): InlineNode[] {
  const last = nodes.at(-1);

  if (last?.kind === "text" && node.kind === "text") {
    return [...nodes.slice(0, -1), { kind: "text", text: last.text + node.text }];
  }

  return [...nodes, node];
}
