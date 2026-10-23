import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { CaptionBrief } from "../domain/caption/caption-brief";
import type { CaptionSentence } from "../domain/caption/caption-sentence";
import {
  type CaptionLine,
  currentIndex,
  type RankedSentence,
  rankSentences,
} from "../domain/caption/caption-timeline";
import { type CaptionTrack, trackSignature } from "../domain/caption/caption-track";
import { segmentSentences } from "../domain/caption/segmentation";
import type { VideoId } from "../domain/caption/value-objects/video-id.vo";
import type { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import { plainTextOf, toMarkup } from "../domain/markup/markup";
import type { ProviderError } from "../domain/provider/provider-error";
import { TranslationQueue } from "../domain/queue/translation-queue";
import type { SegmentOutcome } from "./batch-translation.service";
import type { BatchTranslator } from "./ports/batch-translator";
import type { CaptionDisplay } from "./ports/caption-display";
import type { CaptionSurface } from "./ports/caption-surface";
import type { ProviderCapacity } from "./ports/provider-capacity";
import { RequestPump, type RequestScope, settle } from "./request-pump";
import { type ViewState, ViewStateStore } from "./view-state";

export interface CaptionTranslationDeps {
  surface: CaptionSurface;
  display: CaptionDisplay;
  translator: BatchTranslator;
  capacity: ProviderCapacity;
  target: LanguageCode;
  maxConcurrency: number;
  sentencesPerRequest: number;
  aheadMs: number;
}

type Settlement = Option<string>;

interface Session {
  serial: number;
  track: CaptionTrack;
  signature: string;
  sentences: CaptionSentence[];
  byKey: Map<string, CaptionSentence>;
  placements: Map<string, RankedSentence>;
  settled: Map<number, Settlement>;
  lines: CaptionLine[];
  current: number;
}

const PRECEDING_SENTENCES = 2;

const REMEMBERED_TRACKS = 5;

function remember<V>(entries: Map<string, V>, key: string, value: V): void {
  entries.delete(key);
  entries.set(key, value);

  for (const oldest of entries.keys()) {
    if (entries.size <= REMEMBERED_TRACKS) return;

    entries.delete(oldest);
  }
}

function requestKey(serial: number, sentence: CaptionSentence): string {
  return `${serial}:${sentence.id.value}`;
}

function lineOf(sentence: CaptionSentence, settlement: Settlement | undefined): CaptionLine {
  const translated = settlement ?? Option.none();

  return {
    startMs: sentence.startMs,
    endMs: sentence.endMs,
    original: sentence.text,
    text: translated.unwrapOr(sentence.text),
    translated: translated.isSome(),
  };
}

function settlementOf(outcome: SegmentOutcome | undefined): Settlement {
  if (outcome?.status !== "translated") return Option.none();

  return plainTextOf(outcome.markup);
}

export class CaptionTranslationService {
  private readonly views = new ViewStateStore();
  private readonly queue = new TranslationQueue();
  private readonly tracks = new Map<string, CaptionTrack>();
  private readonly memory = new Map<string, Map<number, Settlement>>();
  private readonly pump: RequestPump<CaptionSentence>;
  private session: Session | undefined;
  private sessions = 0;
  private active = false;
  private leadPending = false;

  public constructor(private readonly deps: CaptionTranslationDeps) {
    this.pump = new RequestPump<CaptionSentence>(
      {
        canPump: () => this.canPump(),
        take: (free) => this.takeNext(free),
        run: (sentences, scope) => this.process(sentences, scope),
        keyOf: (sentence) => requestKey(this.sessions, sentence),
        drained: (failure) => this.afterDrain(failure),
      },
      { capacity: deps.capacity, maxConcurrency: deps.maxConcurrency },
    );
  }

  public attach(): () => void {
    return this.deps.surface.watch({
      onTrack: (track) => this.receiveTrack(track),
      onPlayhead: (ms, seeked) => this.followPlayhead(ms, seeked),
      onNavigate: (videoId) => this.navigate(videoId),
      onCaptionsOff: () => this.turnOff(false),
    });
  }

  public async toggle(): Promise<void> {
    if (this.active) return this.turnOff(true);

    this.active = true;
    this.deps.surface.loadCaptions();
    this.deps.surface.hideNative(true);
    this.views.set({ kind: "translating" });
    this.startKnownTrack(this.deps.surface.videoId());
  }

  public whenIdle(): Promise<void> {
    return this.pump.whenIdle();
  }

  public state(): ViewState {
    return this.views.current();
  }

  public subscribe(listener: (state: ViewState) => void): () => void {
    return this.views.subscribe(listener);
  }

  private receiveTrack(track: CaptionTrack): void {
    remember(this.tracks, track.videoId.value, track);

    if (!this.active || this.session?.signature === trackSignature(track)) return;

    this.startSession(track);
  }

  private startKnownTrack(videoId: Option<VideoId>): void {
    const track = videoId.flatMap((id) => Option.fromNullable(this.tracks.get(id.value)));

    if (track.isSome()) this.startSession(track.unwrap());
  }

  private navigate(videoId: Option<VideoId>): void {
    this.endSession();

    if (!this.active) return;

    this.deps.surface.loadCaptions();
    this.views.set({ kind: "translating" });
    this.startKnownTrack(videoId);
  }

  private turnOff(restore: boolean): void {
    if (!this.active) return;

    this.active = false;
    this.endSession();
    this.deps.surface.hideNative(false);

    if (restore) this.deps.surface.restoreCaptions();

    this.views.set({ kind: "original" });
  }

  private endSession(): void {
    this.pump.cancelAll();

    for (const sentence of this.session?.sentences ?? []) this.queue.drop(sentence.id);

    this.session = undefined;
    this.deps.display.clear();
  }

  private startSession(track: CaptionTrack): void {
    this.endSession();

    const sentences = segmentSentences(track);
    const signature = trackSignature(track);
    const settled = this.memory.get(signature) ?? new Map<number, Settlement>();

    remember(this.memory, signature, settled);

    if (track.language.sharesPrimarySubtagWith(this.deps.target)) {
      for (const sentence of sentences) settled.set(sentence.index, Option.none());
    }

    this.sessions += 1;

    const session: Session = {
      serial: this.sessions,
      track,
      signature,
      sentences,
      byKey: new Map(sentences.map((sentence) => [sentence.id.value, sentence])),
      placements: new Map(),
      settled,
      lines: sentences.map((sentence) => lineOf(sentence, settled.get(sentence.index))),
      current: 0,
    };

    this.session = session;
    this.deps.display.update([...session.lines]);
    this.rank(session, this.deps.surface.playheadMs().unwrapOr(0));
    this.leadPending = true;
    this.views.set({ kind: this.isComplete(session) ? "translated" : "translating" });
    this.pump.schedule();
  }

  private followPlayhead(ms: Option<number>, seeked: boolean): void {
    const session = this.session;

    if (!this.active || session === undefined || ms.isNone()) return;

    const playhead = ms.unwrap();

    if (!seeked && currentIndex(session.sentences, playhead) === session.current) return;

    this.rank(session, playhead);

    if (seeked) {
      this.pump.abortWhere((keys) => !keys.some((key) => session.placements.get(key)?.rank === 0));
      this.leadPending = true;
    }

    this.pump.schedule();
  }

  private rank(session: Session, playheadMs: number): void {
    session.current = currentIndex(session.sentences, playheadMs);

    for (const placement of rankSentences(session.sentences, playheadMs, this.deps.aheadMs)) {
      const sentence = session.sentences[placement.index];

      if (sentence === undefined) continue;

      const key = requestKey(session.serial, sentence);

      session.placements.set(key, placement);

      if (!this.pump.isInFlight(key)) this.enqueue(session, sentence);
    }
  }

  private enqueue(session: Session, sentence: CaptionSentence): void {
    const placement = session.placements.get(requestKey(session.serial, sentence));

    if (session !== this.session || placement === undefined) return;

    if (session.settled.has(sentence.index)) return;

    this.queue.enqueue(sentence.id, placement.rank, "content", placement.position);
  }

  private isComplete(session: Session): boolean {
    return session.sentences.every((sentence) => session.settled.has(sentence.index));
  }

  private canPump(): boolean {
    if (!this.active || this.session === undefined) return false;

    return this.views.isShowingTranslation();
  }

  private takeNext(free: number): CaptionSentence[][] {
    const session = this.session;

    if (session === undefined) return [];

    const lead = this.takeLead(session);

    if (lead.isSome()) return [[lead.unwrap()]];

    const requests: CaptionSentence[][] = [];

    while (requests.length < free) {
      const ids = this.queue.take(Math.max(1, this.deps.sentencesPerRequest));

      if (ids.length === 0) break;

      requests.push(ids.flatMap((id) => session.byKey.get(id.value) ?? []));
    }

    return requests;
  }

  private takeLead(session: Session): Option<CaptionSentence> {
    if (!this.leadPending) return Option.none();

    this.leadPending = false;

    const sentence = session.sentences[session.current];

    if (sentence === undefined || session.settled.has(sentence.index)) return Option.none();

    if (this.pump.isInFlight(requestKey(session.serial, sentence))) return Option.none();

    this.queue.drop(sentence.id);
    this.pump.lead();

    return Option.some(sentence);
  }

  private async process(
    sentences: CaptionSentence[],
    scope: RequestScope,
  ): Promise<Result<void, ProviderError>> {
    const session = this.session;

    if (session === undefined) return Result.ok();

    const live = (): boolean =>
      session === this.session && this.pump.isCurrent(scope) && !scope.signal.aborted;
    const bySegment = new Map(sentences.map((sentence) => [`${sentence.index}`, sentence]));

    const result = await settle(
      this.deps.translator.translate(
        {
          segments: sentences.map((sentence) => ({
            id: `${sentence.index}`,
            markup: toMarkup([{ kind: "text", text: sentence.text }]),
          })),
          source: Option.some(session.track.language),
          target: this.deps.target,
          brief: this.briefFor(session, sentences),
          cachePolicy: "use",
        },
        {
          signal: scope.signal,
          onOutcome: (outcome) => {
            const sentence = bySegment.get(outcome.id);

            if (!live() || sentence === undefined) return;

            this.pump.release(scope);
            this.settleSentence(session, sentence, settlementOf(outcome));
          },
        },
      ),
    );

    if (live() && result.isSuccess) {
      const outcomes = new Map(result.getValue().map((outcome) => [outcome.id, outcome]));

      for (const [id, sentence] of bySegment)
        this.settleSentence(session, sentence, settlementOf(outcomes.get(id)));
    }

    for (const sentence of sentences) this.enqueue(session, sentence);

    return result.map(() => undefined);
  }

  private briefFor(session: Session, sentences: CaptionSentence[]): CaptionBrief {
    const first = sentences[0]?.index ?? 0;

    return {
      ...this.deps.surface.readBrief(),
      generated: session.track.generated,
      preceding: session.sentences
        .slice(Math.max(0, first - PRECEDING_SENTENCES), first)
        .map((sentence) => sentence.text),
    };
  }

  private settleSentence(
    session: Session,
    sentence: CaptionSentence,
    settlement: Settlement,
  ): void {
    if (session.settled.has(sentence.index)) return;

    session.settled.set(sentence.index, settlement);
    session.lines[sentence.index] = lineOf(sentence, settlement);
    this.deps.display.update([...session.lines]);
  }

  private afterDrain(failure: Option<ProviderError>): void {
    if (failure.isSome()) {
      if (this.active) this.views.set({ kind: "error", error: failure.unwrap() });

      return;
    }

    if (this.queue.size() > 0) {
      this.pump.schedule();

      return;
    }

    const session = this.session;

    if (
      this.views.current().kind === "translating" &&
      session !== undefined &&
      this.isComplete(session)
    )
      this.views.set({ kind: "translated" });
  }
}
