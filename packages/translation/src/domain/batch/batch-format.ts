export interface BatchSegment {
  n: number;
  markup: string;
}

interface Decoded {
  segments: Map<number, string>;
  last: number | undefined;
}

const NUMBERED_LINE = /^[ \t`]*\[(\d+)\][ \t]?(.*)$/;

const CLOSING_LINE = /^[ \t]*(`{3}.*)?$/;

export function encodeBatch(segments: BatchSegment[]): string {
  return segments.map(({ n, markup }) => `[${n}] ${markup}`).join("\n");
}

function decodeLines(response: string): Decoded {
  const segments = new Map<number, string>();
  const spoiled = new Set<number>();
  let current: number | undefined;
  let last: number | undefined;

  for (const line of response.split("\n")) {
    const numbered = NUMBERED_LINE.exec(line);

    if (numbered === null) {
      if (current !== undefined && !CLOSING_LINE.test(line)) spoiled.add(current);

      current = undefined;
      continue;
    }

    const key = Number(numbered[1]);

    if (segments.has(key)) spoiled.add(key);

    current = segments.has(key) ? undefined : key;
    last = current ?? last;

    if (current !== undefined) segments.set(key, (numbered[2] ?? "").trim());
  }

  for (const key of spoiled) segments.delete(key);

  return { segments, last };
}

export function decodeBatch(response: string): Map<number, string> {
  return decodeLines(response).segments;
}

export function decodeStreamedBatch(partial: string): Map<number, string> {
  const { segments, last } = decodeLines(partial);

  if (last !== undefined) segments.delete(last);

  return segments;
}
