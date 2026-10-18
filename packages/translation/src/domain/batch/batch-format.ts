export interface BatchSegment {
  n: number;
  markup: string;
}

const SEGMENT_PATTERN = /<seg n="(\d+)">((?:(?!<\/?seg\b)[\s\S])*)<\/seg>/g;

export function encodeBatch(segments: BatchSegment[]): string {
  return segments.map(({ n, markup }) => `<seg n="${n}">${markup}</seg>`).join("\n");
}

export function decodeBatch(response: string): Map<number, string> {
  const decoded = new Map<number, string>();

  for (const [, n, markup] of response.matchAll(SEGMENT_PATTERN)) {
    if (n === undefined) continue;

    const key = Number(n);

    if (decoded.has(key)) continue;

    decoded.set(key, (markup ?? "").trim());
  }

  return decoded;
}
