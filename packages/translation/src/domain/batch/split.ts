import { Result } from "@lambe/kernel/result";
import { appendNode, type InlineNode } from "../block/inline-node";
import { toMarkup } from "../markup/markup";
import { estimateTokens } from "./budget";

interface SegmentTooLong {
  code: "SEGMENT_TOO_LONG";
}

const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });

const OBJECT_REPLACEMENT = "￼";

const WORD_PATTERN = /\s*\S+\s*/g;

function sentencesOf(text: string): string[] {
  return Array.from(sentenceSegmenter.segment(text), ({ segment }) => segment);
}

function pack<T>(units: T[], fits: (piece: T) => boolean, join: (left: T, right: T) => T): T[] {
  const pieces: T[] = [];
  let current: T | undefined;

  for (const unit of units) {
    const candidate = current === undefined ? unit : join(current, unit);

    if (current === undefined || fits(candidate)) {
      current = candidate;
      continue;
    }

    pieces.push(current);
    current = unit;
  }

  if (current !== undefined) pieces.push(current);

  return pieces;
}

function hardSplit(word: string, fits: (text: string) => boolean): string[] {
  return pack(Array.from(word), fits, (left, right) => left + right);
}

function splitTextBy(text: string, fits: (text: string) => boolean): string[] {
  const units = sentencesOf(text).flatMap((sentence) => {
    if (fits(sentence)) return [sentence];

    const words = sentence.match(WORD_PATTERN) ?? [sentence];

    return words.flatMap((word) => (fits(word) ? [word] : hardSplit(word, fits)));
  });

  return pack(units, fits, (left, right) => left + right);
}

export function splitText(text: string, maxTokens: number): string[] {
  return splitTextBy(text, (piece) => estimateTokens(piece) <= maxTokens);
}

function projectionOf(node: InlineNode): string {
  if (node.kind === "text") return node.text;

  if (node.kind === "atom") return OBJECT_REPLACEMENT;

  return node.children.map(projectionOf).join("");
}

function cutOffsets(nodes: InlineNode[]): Map<number, number[]> {
  const projection = nodes.map(projectionOf);
  const starts = projection.map((_, index) =>
    projection.slice(0, index).reduce((length, text) => length + text.length, 0),
  );
  const cuts = new Map<number, number[]>();
  let boundary = 0;

  for (const sentence of sentencesOf(projection.join(""))) {
    boundary += sentence.length;

    const index = starts.findLastIndex((start) => start < boundary);
    const node = nodes[index];
    const start = starts[index] ?? 0;
    const local = boundary - start;

    if (node?.kind !== "text" || !/\s$/.test(node.text.slice(0, local))) continue;

    if (local === node.text.length && index === nodes.length - 1) continue;

    cuts.set(index, [...(cuts.get(index) ?? []), local]);
  }

  return cuts;
}

function joinNodes(left: InlineNode[], right: InlineNode[]): InlineNode[] {
  return right.reduce(appendNode, left);
}

function chunksOf(nodes: InlineNode[]): InlineNode[][] {
  const cuts = cutOffsets(nodes);
  const chunks: InlineNode[][] = [];
  let current: InlineNode[] = [];

  nodes.forEach((node, index) => {
    if (node.kind !== "text") {
      current.push(node);
      return;
    }

    let from = 0;

    for (const offset of cuts.get(index) ?? []) {
      current = appendNode(current, { kind: "text", text: node.text.slice(from, offset) });
      chunks.push(current);
      current = [];
      from = offset;
    }

    if (from < node.text.length) {
      current = appendNode(current, { kind: "text", text: node.text.slice(from) });
    }
  });

  if (current.length > 0) chunks.push(current);

  return chunks;
}

export function splitNodes(
  nodes: InlineNode[],
  maxTokens: number,
): Result<InlineNode[][], SegmentTooLong> {
  const fits = (piece: InlineNode[]): boolean => estimateTokens(toMarkup(piece)) <= maxTokens;

  if (fits(nodes)) return Result.ok([nodes]);

  const units: InlineNode[][] = [];

  for (const chunk of chunksOf(nodes)) {
    const [only] = chunk;

    if (fits(chunk)) {
      units.push(chunk);
      continue;
    }

    if (chunk.length !== 1 || only?.kind !== "text")
      return Result.fail({ code: "SEGMENT_TOO_LONG" });

    const pieces = splitTextBy(only.text, (text) => fits([{ kind: "text", text }]));
    units.push(...pieces.map((text): InlineNode[] => [{ kind: "text", text }]));
  }

  return Result.ok(pack(units, fits, joinNodes));
}
