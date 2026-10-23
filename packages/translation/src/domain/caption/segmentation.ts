import { type CaptionSentence, sentenceId } from "./caption-sentence";
import type { CaptionTrack, TimedText } from "./caption-track";
import { type LanguageRules, rulesFor } from "./language-rules";
import type { VideoId } from "./value-objects/video-id.vo";

const SPEAKER_MARK = ">>";

const TERMINAL_MARK = /[.?!…]$/;

const NUMBER_WITH_DOT = /^\d+\.$/;

const TRAILING_PUNCTUATION = /[,;:.?!…]+$/;

const MIN_TERMINAL_WORDS = 3;

const WORDS_PER_TERMINAL = 40;

const PAUSE_BREAK_MS = 1000;

const BREAK_WORD_AFTER_MS = 300;

const MAX_WORDS = 20;

const MIN_SPLIT_SIDE = 4;

const FRAGMENT_WORDS = 3;

const FRAGMENT_JOIN_GAP_MS = 1500;

const MIN_DURATION_MS = 1000;

interface Piece {
  words: TimedText[];
  sound: boolean;
}

interface SplitCandidate {
  index: number;
  gap: number;
  breakWord: boolean;
  distance: number;
}

type BreakRule = (words: TimedText[], index: number, sentence: TimedText[]) => boolean;

function startOf(words: TimedText[]): number {
  return words[0]?.startMs ?? 0;
}

function endOf(words: TimedText[]): number {
  return words.at(-1)?.endMs ?? 0;
}

function gapBetween(left: TimedText[], right: TimedText[]): number {
  return startOf(right) - endOf(left);
}

function phraseAt(
  words: TimedText[],
  start: number,
  phrase: string,
  normalize: (text: string) => string,
): boolean {
  return phrase.split(" ").every((token, offset) => {
    const word = words[start + offset];

    return word !== undefined && normalize(word.text) === token;
  });
}

function lowercase(text: string): string {
  return text.toLowerCase();
}

function bareWord(text: string): string {
  return text.toLowerCase().replace(TRAILING_PUNCTUATION, "");
}

function startsBreakWord(words: TimedText[], index: number, rules: LanguageRules): boolean {
  return rules.breakWords.some((phrase) => phraseAt(words, index, phrase, bareWord));
}

function isAbbreviation(words: TimedText[], index: number, rules: LanguageRules): boolean {
  return rules.abbreviations.some((phrase) =>
    phrase
      .split(" ")
      .some((_, offset) => index >= offset && phraseAt(words, index - offset, phrase, lowercase)),
  );
}

function endsSentence(words: TimedText[], index: number, rules: LanguageRules): boolean {
  const text = words[index]?.text ?? "";

  if (!TERMINAL_MARK.test(text)) return false;

  return !NUMBER_WITH_DOT.test(text) && !isAbbreviation(words, index, rules);
}

function wordsOf(unit: TimedText): TimedText[] {
  const texts = unit.text.split(/\s+/).filter((text) => text !== "");
  const total = texts.reduce((sum, text) => sum + text.length, 0);
  const duration = unit.endMs - unit.startMs;
  const at = (chars: number): number => unit.startMs + Math.round((duration * chars) / total);
  let consumed = 0;

  return texts.map((text) => {
    const startMs = at(consumed);

    consumed += text.length;

    return { text, startMs, endMs: at(consumed) };
  });
}

function markedPieces(units: TimedText[]): Piece[] {
  const pieces: Piece[] = [];
  let speech: TimedText[] = [];
  let sound: TimedText[] = [];

  const close = () => {
    if (speech.length > 0) pieces.push({ words: speech, sound: false });

    if (sound.length > 0) pieces.push({ words: sound, sound: true });

    speech = [];
    sound = [];
  };

  for (const unit of units) {
    const text = unit.text.trim();

    if (text === "") continue;

    if (text === SPEAKER_MARK) {
      close();
      continue;
    }

    const word = { ...unit, text };

    if (sound.length === 0 && !text.startsWith("[")) {
      speech.push(word);
      continue;
    }

    if (sound.length === 0) close();

    sound.push(word);

    if (text.endsWith("]")) close();
  }

  close();

  return pieces;
}

function isPunctuated(pieces: Piece[]): boolean {
  const words = pieces.flatMap((piece) => piece.words);
  const terminals = words.filter((word) => TERMINAL_MARK.test(word.text)).length;

  return terminals >= MIN_TERMINAL_WORDS && terminals * WORDS_PER_TERMINAL >= words.length;
}

function splitBefore(words: TimedText[], breaks: BreakRule): TimedText[][] {
  const sentences: TimedText[][] = [];
  let current: TimedText[] = [];

  words.forEach((word, index) => {
    if (current.length > 0 && breaks(words, index, current)) {
      sentences.push(current);
      current = [];
    }

    current.push(word);
  });

  if (current.length > 0) sentences.push(current);

  return sentences;
}

function terminalRule(rules: LanguageRules): BreakRule {
  return (words, index) => endsSentence(words, index - 1, rules);
}

function pauseRule(rules: LanguageRules): BreakRule {
  return (words, index, sentence) => {
    const start = words[index]?.startMs ?? 0;

    if (start - endOf(sentence) > PAUSE_BREAK_MS) return true;

    return start - startOf(sentence) >= BREAK_WORD_AFTER_MS && startsBreakWord(words, index, rules);
  };
}

function betterSplit(best: SplitCandidate, candidate: SplitCandidate): SplitCandidate {
  if (candidate.gap !== best.gap) return candidate.gap > best.gap ? candidate : best;

  if (candidate.breakWord !== best.breakWord) return candidate.breakWord ? candidate : best;

  return candidate.distance < best.distance ? candidate : best;
}

function splitPoint(words: TimedText[], rules: LanguageRules): number {
  const candidates: SplitCandidate[] = [];

  for (let index = MIN_SPLIT_SIDE; index <= words.length - MIN_SPLIT_SIDE; index += 1) {
    candidates.push({
      index,
      gap: gapBetween(words.slice(index - 1, index), words.slice(index, index + 1)),
      breakWord: startsBreakWord(words, index, rules),
      distance: Math.abs(index - words.length / 2),
    });
  }

  const [first, ...rest] = candidates;

  if (first === undefined) return Math.floor(words.length / 2);

  return rest.reduce(betterSplit, first).index;
}

function capLength(words: TimedText[], rules: LanguageRules): TimedText[][] {
  if (words.length <= MAX_WORDS) return [words];

  const index = splitPoint(words, rules);

  return [...capLength(words.slice(0, index), rules), ...capLength(words.slice(index), rules)];
}

function isFragment(piece: Piece): boolean {
  return !piece.sound && piece.words.length <= FRAGMENT_WORDS;
}

function canJoin(left: Piece, right: Piece): boolean {
  if (left.sound || right.sound) return false;

  if (left.words.length + right.words.length > MAX_WORDS) return false;

  return gapBetween(left.words, right.words) <= FRAGMENT_JOIN_GAP_MS;
}

function joined(left: Piece, right: Piece): Piece {
  return { words: [...left.words, ...right.words], sound: false };
}

function joinFragments(pieces: Piece[]): Piece[] {
  const queue = [...pieces];
  const result: Piece[] = [];

  queue.forEach((piece, index) => {
    const previous = result.at(-1);
    const next = queue[index + 1];

    if (!isFragment(piece)) {
      result.push(piece);
      return;
    }

    if (previous !== undefined && canJoin(previous, piece)) {
      result[result.length - 1] = joined(previous, piece);
      return;
    }

    if (next !== undefined && canJoin(piece, next)) {
      queue[index + 1] = joined(piece, next);
      return;
    }

    result.push(piece);
  });

  return result;
}

function timedSentences(videoId: VideoId, spans: TimedText[][]): CaptionSentence[] {
  return spans.map((words, index) => {
    const startMs = startOf(words);
    const following = spans[index + 1];
    const nextStart = following === undefined ? Number.POSITIVE_INFINITY : startOf(following);
    const text = words.map((word) => word.text).join(" ");
    const capped = Math.min(endOf(words), nextStart);
    const endMs = Math.max(startMs, capped, Math.min(startMs + MIN_DURATION_MS, nextStart));

    return { id: sentenceId(videoId, index), index, startMs, endMs, text };
  });
}

function cueSentences(track: CaptionTrack): CaptionSentence[] {
  return track.units
    .map((cue) => ({ ...cue, text: cue.text.replace(/\s*\n\s*/g, " ").trim() }))
    .filter((cue) => cue.text !== "")
    .map((cue, index) => ({
      id: sentenceId(track.videoId, index),
      index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: cue.text,
    }));
}

export function segmentSentences(track: CaptionTrack): CaptionSentence[] {
  if (!track.generated) return cueSentences(track);

  const rules = rulesFor(track.language);
  const pieces = markedPieces(track.units.flatMap(wordsOf));
  const breakRule = isPunctuated(pieces) ? terminalRule(rules) : pauseRule(rules);
  const sentences = pieces
    .flatMap((piece) =>
      piece.sound
        ? [piece]
        : splitBefore(piece.words, breakRule).map((words) => ({ words, sound: false })),
    )
    .flatMap((piece) =>
      capLength(piece.words, rules).map((words) => ({ words, sound: piece.sound })),
    );

  return timedSentences(
    track.videoId,
    joinFragments(sentences).map((piece) => piece.words),
  );
}
