const ASCII_WHITESPACE = /[\t\n\f\r ]+/;

function wordEnds(words: string[]): number[] {
  let end = -1;

  return words.map((word) => {
    end += word.length + 1;

    return end;
  });
}

function nearestCut(ends: number[], target: number, min: number, max: number): number {
  let best = min;

  for (let cut = min; cut <= max; cut += 1) {
    const distance = Math.abs((ends[cut - 1] ?? 0) - target);
    const bestDistance = Math.abs((ends[best - 1] ?? 0) - target);

    if (distance < bestDistance) best = cut;
  }

  return best;
}

function distribute(sentence: string, lineLengths: number[]): string[] {
  const words = sentence.split(ASCII_WHITESPACE).filter((word) => word !== "");
  const count = lineLengths.length;

  if (count <= 1) return [words.join(" ")];

  if (words.length < count) return lineLengths.map((_, index) => words[index] ?? "");

  const weights = lineLengths.map((length) => Math.max(length, 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const ends = wordEnds(words);
  const totalChars = ends[ends.length - 1] ?? 0;
  const cuts: number[] = [];
  let reached = 0;
  let previous = 0;

  for (let line = 0; line < count - 1; line += 1) {
    reached += weights[line] ?? 0;
    const target = (totalChars * reached) / totalWeight;
    const cut = nearestCut(ends, target, previous + 1, words.length - (count - 1 - line));

    cuts.push(cut);
    previous = cut;
  }

  return [...cuts, words.length].map((cut, line) =>
    words.slice(line === 0 ? 0 : (cuts[line - 1] ?? 0), cut).join(" "),
  );
}

export function reflowLines(sentence: string, lineLengths: number[]): string[] {
  const filled = lineLengths.flatMap((length, index) => (length > 0 ? [index] : []));

  if (filled.length === 0 || filled.length === lineLengths.length) {
    return distribute(sentence, lineLengths);
  }

  const parts = distribute(
    sentence,
    filled.map((index) => lineLengths[index] ?? 0),
  );

  return lineLengths.map((_, index) => {
    const position = filled.indexOf(index);

    return position === -1 ? "" : (parts[position] ?? "");
  });
}
