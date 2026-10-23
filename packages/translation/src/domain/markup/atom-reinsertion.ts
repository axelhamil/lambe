import { textSlots } from "../block/block-translation";
import type { InlineNode } from "../block/inline-node";

interface Boundary {
  offset: number;
  index: number;
  cut: number;
}

const WORD_END = /\S(?=\s)/gu;

const WHITESPACE = /\s/u;

const CLOSING_PUNCTUATION = /^[)\]}»”’.,;:!?]+$/u;

interface GroupAnchor {
  group: number;
  punctuation: string;
}

const textLength = (nodes: InlineNode[]): number => textSlots(nodes).join("").length;

function wordEnds(text: string): number[] {
  return [...text.matchAll(WORD_END)].map((match) => match.index + match[0].length);
}

function characterEnds(text: string): number[] {
  const ends: number[] = [];
  let end = 0;

  for (const character of text) {
    end += character.length;
    ends.push(end);
  }

  return ends.slice(0, -1);
}

function boundaries(nodes: InlineNode[]): Boundary[] {
  const found: Boundary[] = [];
  const cutsOf = WHITESPACE.test(textSlots(nodes).join("")) ? wordEnds : characterEnds;
  let offset = 0;

  nodes.forEach((node, index) => {
    found.push({ offset, index, cut: 0 });

    if (node.kind === "text") {
      for (const cut of cutsOf(node.text)) found.push({ offset: offset + cut, index, cut });
    }

    offset += textLength([node]);
  });

  found.push({ offset, index: nodes.length, cut: 0 });

  return found;
}

function nearest(candidates: Boundary[], target: number): Boundary | undefined {
  return candidates.reduce<Boundary | undefined>((best, candidate) => {
    if (best === undefined) return candidate;

    return Math.abs(candidate.offset - target) <= Math.abs(best.offset - target) ? candidate : best;
  }, undefined);
}

function relativeAtomPosition(siblings: InlineNode[], key: number): number {
  const index = siblings.findIndex((node) => node.kind === "atom" && node.key === key);
  const total = textLength(siblings);

  if (index <= 0 || total === 0) return 0;

  return textLength(siblings.slice(0, index)) / total;
}

function reinsertAtom(nodes: InlineNode[], key: number, position: number): InlineNode[] {
  const atom: InlineNode = { kind: "atom", key };
  const boundary = nearest(boundaries(nodes), position * textLength(nodes));

  if (boundary === undefined) return [atom];

  const { index, cut } = boundary;
  const node = nodes[index];

  if (cut === 0 || node?.kind !== "text") {
    return [...nodes.slice(0, index), atom, ...nodes.slice(index)];
  }

  return [
    ...nodes.slice(0, index),
    { kind: "text", text: node.text.slice(0, cut) },
    atom,
    { kind: "text", text: node.text.slice(cut) },
    ...nodes.slice(index + 1),
  ];
}

function groupAnchor(siblings: InlineNode[], key: number): GroupAnchor | undefined {
  const index = siblings.findIndex((node) => node.kind === "atom" && node.key === key);
  const previous = siblings[index - 1];

  if (previous?.kind === "group") return { group: previous.key, punctuation: "" };

  const group = siblings[index - 2];

  if (previous?.kind !== "text" || group?.kind !== "group") return undefined;

  return CLOSING_PUNCTUATION.test(previous.text)
    ? { group: group.key, punctuation: previous.text }
    : undefined;
}

function reinsertAfterGroup(
  nodes: InlineNode[],
  key: number,
  anchor: GroupAnchor,
): InlineNode[] | undefined {
  const at = nodes.findIndex((node) => node.kind === "group" && node.key === anchor.group) + 1;

  if (at === 0) return undefined;

  const atom: InlineNode = { kind: "atom", key };
  const next = nodes[at];
  const closed = anchor.punctuation !== "" && next?.kind === "text";

  if (!closed || !next.text.startsWith(anchor.punctuation))
    return [...nodes.slice(0, at), atom, ...nodes.slice(at)];

  const rest = next.text.slice(anchor.punctuation.length);
  const tail: InlineNode[] = rest === "" ? [] : [{ kind: "text", text: rest }];

  return [
    ...nodes.slice(0, at),
    { kind: "text", text: anchor.punctuation },
    atom,
    ...tail,
    ...nodes.slice(at + 1),
  ];
}

export function restoreAtom(
  siblings: InlineNode[],
  key: number,
  nodes: InlineNode[],
): InlineNode[] {
  const anchor = groupAnchor(siblings, key);
  const anchored = anchor === undefined ? undefined : reinsertAfterGroup(nodes, key, anchor);

  return anchored ?? reinsertAtom(nodes, key, relativeAtomPosition(siblings, key));
}
