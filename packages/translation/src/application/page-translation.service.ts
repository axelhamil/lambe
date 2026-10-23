import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { Block, BlockRole } from "../domain/block/block";
import { type BlockTranslation, letterCount, textSlots } from "../domain/block/block-translation";
import type { InlineNode } from "../domain/block/inline-node";
import type { BlockId } from "../domain/block/value-objects/block-id.vo";
import type { CachePolicy } from "../domain/cache/cache-policy";
import { shouldSkipBlock } from "../domain/language/skip-policy";
import type { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import { parseMarkup, plainTextOf, toMarkup } from "../domain/markup/markup";
import type { PageBrief } from "../domain/page/page-brief";
import type { ProviderError } from "../domain/provider/provider-error";
import {
  type ProximityRank,
  type TextMeasure,
  TranslationQueue,
} from "../domain/queue/translation-queue";
import type {
  BatchTranslateOptions,
  SegmentOutcome,
  SegmentRequest,
} from "./batch-translation.service";
import type { BatchTranslator } from "./ports/batch-translator";
import type { LanguageDetector } from "./ports/language-detector";
import type { PageSurface } from "./ports/page-surface";
import type { ProviderCapacity } from "./ports/provider-capacity";
import { RequestPump, type RequestScope, settle } from "./request-pump";
import { ViewStateSource } from "./view-state";

export type { ViewState } from "./view-state";

export interface PageTranslationDeps {
  surface: PageSurface;
  translator: BatchTranslator;
  capacity: ProviderCapacity;
  detector: LanguageDetector;
  target: LanguageCode;
  maxConcurrency: number;
  maxSegmentsPerRequest: number;
  firstRequestSegments: number;
}

interface Session {
  brief: PageBrief;
  source: Promise<Option<LanguageCode>>;
}

interface BatchPlan {
  translations: BlockTranslation[];
  settled: Block[];
}

type Outcomes = Map<string, SegmentOutcome>;

function structuredNodes(outcome: SegmentOutcome | undefined): Option<InlineNode[]> {
  if (outcome?.status !== "translated") return Option.none();

  return parseMarkup(outcome.markup).match({
    ok: (nodes) => Option.some(nodes),
    fail: () => Option.none(),
  });
}

function plainText(outcome: SegmentOutcome | undefined): Option<string> {
  if (outcome?.status !== "translated") return Option.none();

  return plainTextOf(outcome.markup);
}

function keepEdges(original: string, translated: string): string {
  const leading = /^\s*/.exec(original)?.[0] ?? "";
  const trailing = /\s*$/.exec(original)?.[0] ?? "";

  return `${leading}${translated.trim()}${trailing}`;
}

function isBlank(text: string): boolean {
  return text.trim() === "";
}

function briefSignature(brief: PageBrief): string {
  return JSON.stringify([brief.url, brief.title]);
}

function chunks<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, size);

  return Array.from({ length: Math.ceil(items.length / step) }, (_, index) =>
    items.slice(index * step, (index + 1) * step),
  );
}

function balancedRuns<T>(
  items: T[],
  parts: number,
  maxSize: number,
  weight: (item: T) => number,
): T[][] {
  const weights = items.map(weight);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const runs: T[][] = [];
  let run: T[] = [];
  let reached = 0;

  items.forEach((item, index) => {
    run.push(item);
    reached += weights[index] ?? 0;

    const left = items.length - index - 1;
    const partsLeft = parts - runs.length - 1;
    const target = (total * (runs.length + 1)) / parts - (weights[index + 1] ?? 0) / 2;
    const balanced = reached >= target && left <= partsLeft * maxSize;

    if (left === 0 || !(run.length >= maxSize || balanced || left <= partsLeft)) return;

    runs.push(run);
    run = [];
  });

  if (run.length > 0) runs.push(run);

  return runs;
}

export class PageTranslationService extends ViewStateSource {
  private readonly queue = new TranslationQueue();
  private readonly blocks = new Map<string, Block>();
  private readonly ranks = new Map<string, ProximityRank>();
  private readonly positions = new Map<string, number>();
  private readonly reported = new Set<string>();
  private readonly settled = new Set<string>();
  private readonly pump: RequestPump<Block>;
  private session: Session | undefined;
  private started = false;
  private refreshing = new Set<string>();
  private refreshScan = false;
  private firstRequestPending = true;
  private nextPosition = 0;

  public constructor(private readonly deps: PageTranslationDeps) {
    super();
    this.pump = new RequestPump<Block>(
      {
        canPump: () => this.canPump(),
        take: (free, concurrency) => this.takeNext(free, concurrency),
        run: (batch, scope) => this.process(batch, scope),
        keyOf: (block) => block.id.value,
        drained: (failure) => this.afterDrain(failure),
      },
      { capacity: deps.capacity, maxConcurrency: deps.maxConcurrency },
    );
  }

  public async toggle(): Promise<void> {
    const kind = this.views.current().kind;

    if (kind === "translating" || kind === "translated") return this.showOriginal();

    if (!this.started) return this.start();

    if (kind === "error") return this.resume();

    this.deps.surface.show("translated");
    this.resume();
  }

  public async retranslate(): Promise<void> {
    this.refreshing = new Set(this.blocks.keys());
    this.refreshScan = this.session === undefined;

    if (!this.started) return this.start();

    this.pump.cancelAll();
    this.firstRequestPending = true;
    this.deps.surface.show("original");
    this.settled.clear();

    for (const key of this.ranks.keys()) this.enqueueIfPending(key);

    this.views.set({ kind: "translating" });
    this.schedule();
  }

  public whenIdle(): Promise<void> {
    return this.pump.whenIdle();
  }

  private async start(): Promise<void> {
    this.started = true;
    this.views.set({ kind: "translating" });

    const brief = this.deps.surface.readBrief();
    const source = await this.sourceLanguage(brief);

    if (source.isFailure) {
      this.started = false;
      this.views.set({ kind: "error", error: source.getError() });

      return;
    }

    this.session = { brief, source: Promise.resolve(source.getValue()) };

    const scanned = this.deps.surface.scan();

    if (this.refreshScan)
      for (const scannedBlock of scanned) this.refreshing.add(scannedBlock.id.value);

    this.refreshScan = false;
    this.addBlocks(scanned);
    this.deps.surface.watch({
      onBlocks: (blocks) => {
        this.followNavigation();
        this.addBlocks(blocks);
        this.schedule();
      },
      onProximity: (id, rank) => {
        this.updateProximity(id.value, rank);
        this.schedule();
      },
    });
    this.schedule();
  }

  private sourceLanguage(brief: PageBrief): Promise<Result<Option<LanguageCode>, ProviderError>> {
    const sample = [brief.title, brief.headings[0] ?? ""].join(" ").trim();

    if (brief.sourceLanguage.isSome() || sample === "") {
      return Promise.resolve(Result.ok(brief.sourceLanguage));
    }

    return settle(
      Promise.resolve()
        .then(() => this.deps.detector.detect(sample))
        .then((detected) => Result.ok(detected)),
    );
  }

  private followNavigation(): void {
    const current = this.session;
    const brief = this.deps.surface.readBrief();

    if (current === undefined || briefSignature(brief) === briefSignature(current.brief)) return;

    const source = this.sourceLanguage(brief).then((detected) => detected.unwrapOr(Option.none()));

    this.session = { brief, source };
  }

  private showOriginal(): void {
    this.pump.cancelAll();
    this.deps.surface.show("original");
    this.views.set({ kind: "original" });
  }

  private resume(): void {
    this.views.set({ kind: this.isComplete() ? "translated" : "translating" });
    this.schedule();
  }

  private isComplete(): boolean {
    if (this.pump.isPumping() || this.queue.size() > 0) return false;

    return [...this.blocks.keys()].every((key) => this.reported.has(key));
  }

  private addBlocks(blocks: Block[]): void {
    for (const block of blocks) {
      const key = block.id.value;

      this.blocks.set(key, block);
      this.positions.set(key, this.positions.get(key) ?? this.nextPosition++);
      this.settled.delete(key);
      this.enqueueIfPending(key);
    }
  }

  private forget(key: string): void {
    this.blocks.delete(key);
    this.ranks.delete(key);
    this.positions.delete(key);
    this.reported.delete(key);
    this.settled.delete(key);
    this.refreshing.delete(key);
  }

  private updateProximity(key: string, rank: Option<ProximityRank>): void {
    const block = this.blocks.get(key);

    this.reported.add(key);

    if (rank.isNone()) {
      this.ranks.delete(key);

      if (block !== undefined) this.queue.drop(block.id);

      this.cancelIfFar(key);

      return;
    }

    this.ranks.set(key, rank.unwrap());
    this.enqueueIfPending(key);
  }

  private cancelIfFar(key: string): void {
    this.pump.abortWhere(
      (keys) => keys.includes(key) && !keys.some((other) => this.ranks.has(other)),
    );
  }

  private enqueueIfPending(key: string): void {
    if (this.pump.isInFlight(key)) return;

    this.enqueue(key);
  }

  private enqueue(key: string): void {
    const block = this.blocks.get(key);
    const rank = this.ranks.get(key);

    if (block === undefined || rank === undefined) return;

    if (this.settled.has(key)) return;

    this.queue.enqueue(block.id, rank, block.role, this.positions.get(key) ?? 0);
  }

  private canPump(): boolean {
    if (this.session === undefined) return false;

    return this.views.isShowingTranslation();
  }

  private schedule(): void {
    this.pump.schedule();
  }

  private afterDrain(failure: Option<ProviderError>): void {
    if (failure.isSome()) {
      this.views.set({ kind: "error", error: failure.unwrap() });

      return;
    }

    if (this.queue.size() > 0) {
      this.schedule();

      return;
    }

    if (this.views.current().kind === "translating" && this.isComplete())
      this.views.set({ kind: "translated" });
  }

  private takeNext(free: number, concurrency: number): Block[][] {
    return this.takeIds(free, concurrency).map((ids) =>
      ids.flatMap((id) => this.blocks.get(id.value) ?? []),
    );
  }

  private takeIds(free: number, concurrency: number): BlockId[][] {
    const max = Math.max(1, this.deps.maxSegmentsPerRequest);
    const urgent = this.visibleContentOutstanding();
    const maxRank: ProximityRank = urgent ? 0 : 1;
    const maxRole: BlockRole = urgent ? "content" : "chrome";
    const frontRank: ProximityRank = urgent || !this.queue.holds(1, "content") ? 0 : 1;

    if (this.firstRequestPending) {
      const firstSize = Math.min(max, Math.max(1, this.deps.firstRequestSegments));
      const first = this.queue.takeFirst(firstSize, frontRank, maxRole, (id) => this.measure(id));

      if (first.length > 0) {
        this.firstRequestPending = false;

        if (this.deps.capacity.concurrency().isSome()) this.pump.lead();

        return [first];
      }
    }

    const parts = Math.min(free, concurrency);
    const front = parts > 1 ? this.queue.take(parts * max, frontRank, maxRole) : [];

    if (front.length > 0) {
      return balancedRuns(front, parts, max, (id) => {
        const block = this.blocks.get(id.value);

        return block === undefined ? 0 : toMarkup(block.nodes).length;
      });
    }

    const next = this.queue.take(max, maxRank, maxRole);

    return next.length > 0 ? [next] : [];
  }

  private measure(id: BlockId): TextMeasure {
    const nodes = this.blocks.get(id.value)?.nodes ?? [];

    return { letters: letterCount(nodes), length: textSlots(nodes).join("").trim().length };
  }

  private visibleContentOutstanding(): boolean {
    if (this.queue.holds(0, "content")) return true;

    return [...this.ranks].some(
      ([key, rank]) =>
        rank === 0 && this.pump.isInFlight(key) && this.blocks.get(key)?.role !== "chrome",
    );
  }

  private async process(batch: Block[], scope: RequestScope): Promise<Result<void, ProviderError>> {
    const session = this.session;

    if (session === undefined) return Result.ok();

    const plan = await settle(this.translateBatch(batch, session, scope));
    const stale = !this.pump.isCurrent(scope) || scope.signal.aborted;

    if (!stale && plan.isSuccess) this.apply(plan.getValue());

    for (const block of batch) this.enqueue(block.id.value);

    return plan.map(() => undefined);
  }

  private apply(plan: BatchPlan): void {
    for (const block of plan.settled) {
      this.settled.add(block.id.value);
      this.refreshing.delete(block.id.value);
    }

    for (const translation of plan.translations) {
      const committed = this.deps.surface.commit(translation);

      if (committed.isFailure) this.forget(translation.blockId.value);
    }
  }

  private async translateBatch(
    batch: Block[],
    session: Session,
    scope: RequestScope,
  ): Promise<Result<BatchPlan, ProviderError>> {
    const skips = await Promise.all(batch.map((block) => this.isInTargetLanguage(block)));
    const sendable = batch.filter((_, index) => skips[index] !== true);

    if (sendable.length === 0) return Result.ok({ translations: [], settled: batch });

    const policy = this.policyFor(batch);
    const committed = new Set<string>();
    const structured = await this.request(
      sendable.map((block, index) => ({ id: `${index}`, markup: toMarkup(block.nodes) })),
      session,
      policy,
      {
        signal: scope.signal,
        onOutcome: (outcome) => {
          const block = sendable[Number(outcome.id)];
          const nodes = structuredNodes(outcome);

          if (!this.pump.isCurrent(scope) || block === undefined || nodes.isNone()) return;

          committed.add(outcome.id);
          this.pump.release(scope);
          this.apply({
            translations: [{ blockId: block.id, kind: "structured", nodes: nodes.unwrap() }],
            settled: [block],
          });
        },
      },
    );

    if (structured.isFailure) return Result.fail(structured.getError());

    const translations: BlockTranslation[] = [];
    const fallback: Block[] = [];

    sendable.forEach((block, index) => {
      if (committed.has(`${index}`)) return;

      const nodes = structuredNodes(structured.getValue().get(`${index}`));

      if (nodes.isNone()) {
        fallback.push(block);

        return;
      }

      translations.push({ blockId: block.id, kind: "structured", nodes: nodes.unwrap() });
    });

    const near = fallback.filter((block) => this.ranks.has(block.id.value));
    const far = new Set(fallback.filter((block) => !near.includes(block)));
    const slotted = await this.translateSlots(near, session, policy, scope.signal);

    return slotted.map((slotTranslations) => ({
      translations: [...translations, ...slotTranslations],
      settled: batch.filter((block) => !far.has(block)),
    }));
  }

  private async translateSlots(
    blocks: Block[],
    session: Session,
    policy: CachePolicy,
    signal: AbortSignal,
  ): Promise<Result<BlockTranslation[], ProviderError>> {
    const slots = blocks.map((block) => textSlots(block.nodes));
    const segments = slots.flatMap((texts, blockIndex) =>
      texts.flatMap((slot, slotIndex) =>
        isBlank(slot)
          ? []
          : [
              {
                id: `${blockIndex}.${slotIndex}`,
                markup: toMarkup([{ kind: "text", text: slot }]),
              },
            ],
      ),
    );
    const outcomes: Outcomes = new Map();

    for (const chunk of chunks(segments, this.deps.maxSegmentsPerRequest)) {
      const result = await this.request(chunk, session, policy, { signal });

      if (result.isFailure) return Result.fail(result.getError());

      for (const [id, outcome] of result.getValue()) outcomes.set(id, outcome);
    }

    return Result.ok(
      blocks.flatMap((block, blockIndex): BlockTranslation[] => {
        const texts = (slots[blockIndex] ?? []).map((slot, slotIndex) => {
          if (isBlank(slot)) return Option.some(slot);

          return plainText(outcomes.get(`${blockIndex}.${slotIndex}`)).map((translated) =>
            keepEdges(slot, translated),
          );
        });

        if (texts.some((translated) => translated.isNone())) return [];

        return [{ blockId: block.id, kind: "text-slots", texts: texts.map((t) => t.unwrap()) }];
      }),
    );
  }

  private async isInTargetLanguage(block: Block): Promise<boolean> {
    const content = textSlots(block.nodes).join("");
    const detected = await this.deps.detector.detect(content);

    return shouldSkipBlock({
      detected,
      target: this.deps.target,
      charCount: content.trim().length,
    });
  }

  private policyFor(batch: Block[]): CachePolicy {
    return batch.some((block) => this.refreshing.has(block.id.value)) ? "refresh" : "use";
  }

  private async request(
    segments: SegmentRequest[],
    session: Session,
    cachePolicy: CachePolicy,
    options: BatchTranslateOptions,
  ): Promise<Result<Outcomes, ProviderError>> {
    const result = await this.deps.translator.translate(
      {
        segments,
        source: await session.source,
        target: this.deps.target,
        brief: session.brief,
        cachePolicy,
      },
      options,
    );

    return result.map((outcomes) => new Map(outcomes.map((outcome) => [outcome.id, outcome])));
  }
}
