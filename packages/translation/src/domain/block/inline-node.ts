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
