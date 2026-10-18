import type { InlineNode } from "../block/inline-node";

interface ShellLayer {
  before: InlineNode[];
  group: number | undefined;
  after: InlineNode[];
}

export type EdgeShell = ShellLayer[];

interface Peeled {
  shell: EdgeShell;
  core: InlineNode[];
}

const BLANK = /^[ \t\n\f\r]*$/;

const LEADING_SPACE = /^[ \t\n\f\r]+/;

const TRAILING_SPACE = /[ \t\n\f\r]+$/;

function isEdge(node: InlineNode | undefined): boolean {
  return node?.kind === "atom" || (node?.kind === "text" && BLANK.test(node.text));
}

function hasText(nodes: InlineNode[]): boolean {
  return nodes.some(
    (node) =>
      (node.kind === "text" && !BLANK.test(node.text)) ||
      (node.kind === "group" && hasText(node.children)),
  );
}

function edgeCount(nodes: InlineNode[]): { leading: number; trailing: number } {
  let leading = 0;
  let trailing = 0;

  while (leading < nodes.length && isEdge(nodes[leading])) leading += 1;

  while (trailing < nodes.length - leading && isEdge(nodes[nodes.length - 1 - trailing])) {
    trailing += 1;
  }

  return { leading, trailing };
}

function spaces(text: string): InlineNode[] {
  return text === "" ? [] : [{ kind: "text", text }];
}

function withText(node: InlineNode, text: string): InlineNode[] {
  return node.kind === "text" ? spaces(text) : [node];
}

function splitSpaces(core: InlineNode[]): { layer: ShellLayer; core: InlineNode[] } {
  const first = core[0];
  const last = core[core.length - 1];
  const lead = first?.kind === "text" ? (LEADING_SPACE.exec(first.text)?.[0] ?? "") : "";
  const trail = last?.kind === "text" ? (TRAILING_SPACE.exec(last.text)?.[0] ?? "") : "";
  const trimmed = core.flatMap((node, index) => {
    if (node.kind !== "text") return [node];

    const start = index === 0 ? lead.length : 0;
    const end = index === core.length - 1 ? node.text.length - trail.length : node.text.length;

    return withText(node, node.text.slice(start, end));
  });

  return { layer: { before: spaces(lead), group: undefined, after: spaces(trail) }, core: trimmed };
}

function closeShell(shell: EdgeShell, core: InlineNode[]): Peeled {
  if (shell.length === 0) return { shell, core };

  const split = splitSpaces(core);
  const { before, after } = split.layer;

  if (before.length + after.length === 0) return { shell, core };

  return { shell: [...shell, split.layer], core: split.core };
}

export function peelEdges(nodes: InlineNode[]): Peeled {
  const shell: EdgeShell = [];
  let core = nodes;

  for (;;) {
    const { leading, trailing } = edgeCount(core);
    const middle = core.slice(leading, core.length - trailing);

    if (!hasText(middle)) return { shell, core };

    const before = core.slice(0, leading);
    const after = core.slice(core.length - trailing);
    const [only] = middle;

    if (middle.length !== 1 || only?.kind !== "group") {
      if (leading + trailing > 0) shell.push({ before, group: undefined, after });

      return closeShell(shell, middle);
    }

    shell.push({ before, group: only.key, after });
    core = only.children;
  }
}

export function rewrapEdges(shell: EdgeShell, core: InlineNode[]): InlineNode[] {
  return shell.reduceRight<InlineNode[]>((inner, { before, group, after }) => {
    const wrapped: InlineNode[] =
      group === undefined ? inner : [{ kind: "group", key: group, children: inner }];

    return [...before, ...wrapped, ...after];
  }, core);
}
