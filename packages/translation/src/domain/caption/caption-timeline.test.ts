import { describe, expect, test } from "bun:test";
import { type CaptionSentence, sentenceId } from "./caption-sentence";
import { activeLines, type CaptionLine, currentIndex, rankSentences } from "./caption-timeline";
import { VideoId } from "./value-objects/video-id.vo";

const videoId = VideoId.create("dQw4w9WgXcQ").getValue();

const spans: [number, number][] = [
  [0, 2000],
  [3000, 5000],
  [5000, 9000],
  [20000, 22000],
  [80000, 82000],
];

const sentences: CaptionSentence[] = spans.map(([startMs, endMs], index) => ({
  id: sentenceId(videoId, index),
  index,
  startMs,
  endMs,
  text: `sentence ${index}`,
  sound: false,
}));

const line = (startMs: number, endMs: number, text: string): CaptionLine => ({
  startMs,
  endMs,
  original: text,
  text,
  translated: false,
});

describe("currentIndex", () => {
  test("current_index_finds_the_containing_or_next_sentence", () => {
    expect(currentIndex(sentences, 0)).toBe(0);
    expect(currentIndex(sentences, 1999)).toBe(0);
    expect(currentIndex(sentences, 2500)).toBe(1);
    expect(currentIndex(sentences, 5000)).toBe(2);
    expect(currentIndex(sentences, 50000)).toBe(4);
    expect(currentIndex(sentences, 90000)).toBe(4);
  });
});

describe("rankSentences", () => {
  test("window_ahead_is_rank_zero", () => {
    const ranked = rankSentences(sentences, 4000, 17000);

    expect(ranked.map((entry) => entry.rank)).toEqual([1, 0, 0, 0, 1]);
  });

  test("sentences_behind_come_last_in_circular_order", () => {
    const ranked = rankSentences(sentences, 21000, 60000);
    const order = [...ranked].sort((a, b) => a.position - b.position).map((entry) => entry.index);

    expect(order).toEqual([3, 4, 0, 1, 2]);
    expect(ranked.filter((entry) => entry.rank === 0).map((entry) => entry.index)).toEqual([3, 4]);
  });

  test("seek_back_reorders_from_the_new_playhead", () => {
    const before = rankSentences(sentences, 81000, 60000);
    const after = rankSentences(sentences, 3500, 60000);
    const orderOf = (ranked: typeof before): number[] =>
      [...ranked].sort((a, b) => a.position - b.position).map((entry) => entry.index);

    expect(orderOf(before)).toEqual([4, 0, 1, 2, 3]);
    expect(orderOf(after)).toEqual([1, 2, 3, 4, 0]);
    expect(after.map((entry) => entry.rank)).toEqual([1, 0, 0, 0, 1]);
  });
});

describe("activeLines", () => {
  test("active_lines_respect_half_open_spans_and_cap_at_two", () => {
    const lines = [
      line(3000, 6000, "c"),
      line(0, 2000, "a"),
      line(1000, 4000, "b"),
      line(2500, 5000, "d"),
    ];

    expect(activeLines(lines, 2000).map((entry) => entry.text)).toEqual(["b"]);
    expect(activeLines(lines, 1999).map((entry) => entry.text)).toEqual(["a", "b"]);
    expect(activeLines(lines, 3500).map((entry) => entry.text)).toEqual(["b", "d"]);
    expect(activeLines(lines, 6000)).toEqual([]);
  });
});
