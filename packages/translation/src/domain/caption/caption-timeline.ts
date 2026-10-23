import type { ProximityRank } from "../queue/translation-queue";
import type { CaptionSentence } from "./caption-sentence";

export interface CaptionLine {
  startMs: number;
  endMs: number;
  original: string;
  text: string;
  translated: boolean;
}

export interface RankedSentence {
  index: number;
  rank: ProximityRank;
  position: number;
}

const MAX_ACTIVE_LINES = 2;

export function currentIndex(sentences: CaptionSentence[], playheadMs: number): number {
  let low = 0;
  let high = sentences.length;

  while (low < high) {
    const middle = (low + high) >> 1;
    const startMs = sentences[middle]?.startMs ?? Number.POSITIVE_INFINITY;

    if (startMs <= playheadMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const containing = sentences[low - 1];

  if (containing !== undefined && playheadMs < containing.endMs) {
    return low - 1;
  }

  return Math.max(0, Math.min(low, sentences.length - 1));
}

export function rankSentences(
  sentences: CaptionSentence[],
  playheadMs: number,
  aheadMs: number,
): RankedSentence[] {
  const count = sentences.length;
  const current = currentIndex(sentences, playheadMs);
  const windowEndMs = playheadMs + aheadMs;

  return sentences.map((sentence, index) => {
    const overlaps = sentence.startMs <= windowEndMs && sentence.endMs > playheadMs;
    const rank: ProximityRank = overlaps || index === current ? 0 : 1;

    return { index, rank, position: (index - current + count) % count };
  });
}

export function activeLines(lines: CaptionLine[], timeMs: number): CaptionLine[] {
  return lines
    .filter((line) => line.startMs <= timeMs && timeMs < line.endMs)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, MAX_ACTIVE_LINES);
}
