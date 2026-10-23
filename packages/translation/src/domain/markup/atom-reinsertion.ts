import { textSlots } from "../block/block-translation";
import type { InlineNode } from "../block/inline-node";

interface Boundary {
  offset: number;
  index: number;
  cut: number;
}

const WORD_END = /\S(?=\s)/gu;

const WHITESPACE = /\s/u;

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

export function relativeAtomPosition(siblings: InlineNode[], key: number): number {
  const index = siblings.findIndex((node) => node.kind === "atom" && node.key === key);
  const total = textLength(siblings);

  if (index <= 0 || total === 0) return 0;

  return textLength(siblings.slice(0, index)) / total;
}

export function reinsertAtom(nodes: InlineNode[], key: number, position: number): InlineNode[] {
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
