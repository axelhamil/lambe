import type { BatchSegment } from "./batch-format";
import { encodeBatch } from "./batch-format";

const CHARS_PER_TOKEN = 3;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function maxInputTokens(contextTokens: number, overheadTokens: number): number {
  return Math.floor(((contextTokens - overheadTokens) * 10) / 23);
}

export function planBatches(
  segments: BatchSegment[],
  maxInputTokens: number,
  maxSegments: number,
): BatchSegment[][] {
  const batches: BatchSegment[][] = [];
  let current: BatchSegment[] = [];

  for (const segment of segments) {
    const candidate = [...current, segment];
    const fits =
      candidate.length <= maxSegments && estimateTokens(encodeBatch(candidate)) <= maxInputTokens;

    if (fits || current.length === 0) {
      current = candidate;
      continue;
    }

    batches.push(current);
    current = [segment];
  }

  if (current.length > 0) batches.push(current);

  return batches;
}
