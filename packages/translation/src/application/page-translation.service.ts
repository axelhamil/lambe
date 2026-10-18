import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { Block } from "../domain/block/block";
import { type BlockTranslation, textSlots } from "../domain/block/block-translation";
import type { InlineNode } from "../domain/block/inline-node";
import type { BlockId } from "../domain/block/value-objects/block-id.vo";
import type { CachePolicy } from "../domain/cache/cache-policy";
import { shouldSkipBlock } from "../domain/language/skip-policy";
import type { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import { parseMarkup, toMarkup } from "../domain/markup/markup";
import type { PageBrief } from "../domain/page/page-brief";
import { type ProviderError, providerError } from "../domain/provider/provider-error";
import { type ProximityRank, TranslationQueue } from "../domain/queue/translation-queue";
import type {
  BatchTranslateOptions,
  SegmentOutcome,
  SegmentRequest,
} from "./batch-translation.service";
import type { BatchTranslator } from "./ports/batch-translator";
import type { LanguageDetector } from "./ports/language-detector";
import type { PageSurface } from "./ports/page-surface";
import type { ProviderCapacity } from "./ports/provider-capacity";

export type ViewState =
  | { kind: "original" }
  | { kind: "translating" }
  | { kind: "translated" }
  | { kind: "error"; error: ProviderError };

export interface PageTranslationDeps {
  surface: PageSurface;
  translator: BatchTranslator;
  capacity: ProviderCapacity;
  detector: LanguageDetector;
  target: LanguageCode;
  maxSegmentsPerRequest: number;
  firstRequestSegments: number;
}

type StateListener = (state: ViewState) => void;

interface Session {
  brief: PageBrief;
  source: Promise<Option<LanguageCode>>;
}

interface BatchPlan {
  translations: BlockTranslation[];
  settled: Block[];
}

interface RequestScope {
  epoch: number;
  signal: AbortSignal;
}

type Outcomes = Map<string, SegmentOutcome>;

const REQUESTS_AHEAD = 1;

function structuredNodes(outcome: SegmentOutcome | undefined): Option<InlineNode[]> {
  if (outcome?.status !== "translated") return Option.none();

  return parseMarkup(outcome.markup).match({
    ok: (nodes) => Option.some(nodes),
    fail: () => Option.none(),
  });
}

function plainText(outcome: SegmentOutcome | undefined): Option<string> {
  return structuredNodes(outcome).flatMap((nodes) => {
    const [only] = nodes;

    if (nodes.length !== 1 || only?.kind !== "text") return Option.none();

    return Option.some(only.text);
  });
}

function keepEdges(original: string, translated: string): string {
  const leading = /^\s*/.exec(original)?.[0] ?? "";
  const trailing = /\s*$/.exec(original)?.[0] ?? "";

  return `${leading}${translated.trim()}${trailing}`;
}

function isBlank(text: string): boolean {
  return text.trim() === "";
}

function unreachable(cause: unknown): ProviderError {
  const detail = cause instanceof Error ? cause.message : String(cause);

  return providerError("PROVIDER_UNREACHABLE", `The translation port failed: ${detail}`);
}

function settle<T>(pending: Promise<Result<T, ProviderError>>): Promise<Result<T, ProviderError>> {
  return pending.catch((cause: unknown) => Result.fail(unreachable(cause)));
}

function workerDisconnected(): ProviderError {
  return providerError(
    "PROVIDER_UNREACHABLE",
    "The extension worker disconnected twice in a row. Toggle the translation to try again.",
  );
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

export class PageTranslationService {
  private view: ViewState = { kind: "original" };
  private readonly listeners = new Set<StateListener>();
  private readonly queue = new TranslationQueue();
  private readonly blocks = new Map<string, Block>();
  private readonly ranks = new Map<string, ProximityRank>();
  private readonly positions = new Map<string, number>();
  private readonly reported = new Set<string>();
  private readonly settled = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly controllers = new Set<AbortController>();
  private session: Session | undefined;
  private started = false;
  private refreshing = new Set<string>();
  private refreshScan = false;
  private epoch = 0;
  private firstRequestPending = true;
  private transportRetried = false;
  private transportGeneration = 0;
  private nextPosition = 0;
  private visibleFallbacks = 0;
  private pumping = false;
  private wake: () => void = () => undefined;
  private drained: Promise<void> = Promise.resolve();

  public constructor(private readonly deps: PageTranslationDeps) {}

  public async toggle(): Promise<void> {
    const kind = this.view.kind;

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

    this.cancelInFlight();
    this.firstRequestPending = true;
    this.deps.surface.show("original");
    this.settled.clear();

    for (const key of this.ranks.keys()) this.enqueueIfPending(key);

    this.setView({ kind: "translating" });
    this.schedule();
  }

  public state(): ViewState {
    return this.view;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public async whenIdle(): Promise<void> {
    let current: Promise<void>;

    do {
      current = this.drained;
      await current;
    } while (current !== this.drained);
  }

  private async start(): Promise<void> {
    this.started = true;
    this.setView({ kind: "translating" });

    const brief = this.deps.surface.readBrief();
    const source = await this.sourceLanguage(brief);

    if (source.isFailure) {
      this.started = false;
      this.setView({ kind: "error", error: source.getError() });

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
    this.cancelInFlight();
    this.deps.surface.show("original");
    this.setView({ kind: "original" });
  }

  private cancelInFlight(): void {
    this.epoch += 1;
    this.transportRetried = false;

    for (const controller of this.controllers) controller.abort();

    this.controllers.clear();
  }

  private resume(): void {
    this.transportRetried = false;
    this.setView({ kind: this.isComplete() ? "translated" : "translating" });
    this.schedule();
  }

  private isComplete(): boolean {
    if (this.pumping || this.queue.size() > 0) return false;

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

      return;
    }

    this.ranks.set(key, rank.unwrap());
    this.enqueueIfPending(key);
  }

  private enqueueIfPending(key: string): void {
    const block = this.blocks.get(key);
    const rank = this.ranks.get(key);

    if (block === undefined || rank === undefined) return;

    if (this.settled.has(key) || this.inFlight.has(key)) return;

    this.queue.enqueue(block.id, rank, block.role, this.positions.get(key) ?? 0);
  }

  private canPump(): boolean {
    return this.view.kind === "translating" || this.view.kind === "translated";
  }

  private schedule(): void {
    const session = this.session;

    if (this.pumping) {
      this.wake();

      return;
    }

    if (session === undefined || !this.canPump()) return;

    this.pumping = true;
    this.drained = this.pump(session);
  }

  private async pump(session: Session): Promise<void> {
    const failure = await this.drain(session).catch((cause: unknown) =>
      Option.some(unreachable(cause)),
    );

    this.pumping = false;

    if (failure.isSome()) {
      this.setView({ kind: "error", error: failure.unwrap() });

      return;
    }

    if (this.queue.size() > 0) return this.schedule();

    if (this.view.kind === "translating" && this.isComplete()) this.setView({ kind: "translated" });
  }

  private async drain(session: Session): Promise<Option<ProviderError>> {
    await Promise.resolve();

    const lanes = new Set<Promise<void>>();
    let failure: Option<ProviderError> = Option.none();

    for (;;) {
      const free = this.laneCount() - lanes.size;
      const requests = failure.isNone() && this.canPump() && free > 0 ? this.takeNext(free) : [];

      for (const ids of requests) {
        const lane = this.process(
          ids.flatMap((id) => this.blocks.get(id.value) ?? []),
          this.session ?? session,
        ).then((processed) => {
          lanes.delete(lane);

          if (processed.isFailure && failure.isNone()) failure = Option.some(processed.getError());
        });

        lanes.add(lane);
      }

      if (requests.length > 0) continue;

      if (lanes.size === 0) return failure;

      await Promise.race([
        ...lanes,
        new Promise<void>((resolve) => {
          this.wake = resolve;
        }),
      ]);
    }
  }

  private laneCount(): number {
    return Math.max(1, this.deps.capacity.concurrency()) + REQUESTS_AHEAD;
  }

  private takeNext(free: number): BlockId[][] {
    const max = Math.max(1, this.deps.maxSegmentsPerRequest);

    if (this.visibleFallbacks > 0) {
      const visible = this.queue.take(max, 0, "content");

      return visible.length > 0 ? [visible] : [];
    }

    if (this.firstRequestPending) {
      const first = this.queue.take(Math.min(max, Math.max(1, this.deps.firstRequestSegments)), 0);

      if (first.length > 0) {
        this.firstRequestPending = false;

        return [first];
      }
    }

    const parts = Math.min(free, Math.max(1, this.deps.capacity.concurrency()));
    const visible = parts > 1 ? this.queue.take(parts * max, 0) : [];

    if (visible.length > 0) {
      return balancedRuns(visible, parts, max, (id) => {
        const block = this.blocks.get(id.value);

        return block === undefined ? 0 : toMarkup(block.nodes).length;
      });
    }

    const next = this.queue.take(max);

    return next.length > 0 ? [next] : [];
  }

  private async process(batch: Block[], session: Session): Promise<Result<void, ProviderError>> {
    const controller = new AbortController();
    const scope = { epoch: this.epoch, signal: controller.signal };
    const generation = this.transportGeneration;

    this.controllers.add(controller);

    for (const block of batch) this.inFlight.add(block.id.value);

    const plan = await settle(this.translateBatch(batch, session, scope));

    this.controllers.delete(controller);

    for (const block of batch) this.inFlight.delete(block.id.value);

    const stale = scope.epoch !== this.epoch || scope.signal.aborted;

    if (stale || plan.isFailure) {
      for (const block of batch) this.enqueueIfPending(block.id.value);

      if (stale) return Result.ok();

      return this.transportFailure(plan.getError(), generation);
    }

    this.transportRetried = false;
    this.apply(plan.getValue());

    return Result.ok();
  }

  private transportFailure(error: ProviderError, generation: number): Result<void, ProviderError> {
    if (error.code !== "REQUEST_CANCELLED") return Result.fail(error);

    if (generation !== this.transportGeneration) return Result.ok();

    if (this.transportRetried) return Result.fail(workerDisconnected());

    this.transportRetried = true;
    this.transportGeneration += 1;

    return Result.ok();
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

          if (scope.epoch !== this.epoch || block === undefined || nodes.isNone()) return;

          committed.add(outcome.id);
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

    const slotted = await this.translateFallback(fallback, session, policy, scope.signal);

    return slotted.map((slotTranslations) => ({
      translations: [...translations, ...slotTranslations],
      settled: batch,
    }));
  }

  private async translateFallback(
    blocks: Block[],
    session: Session,
    policy: CachePolicy,
    signal: AbortSignal,
  ): Promise<Result<BlockTranslation[], ProviderError>> {
    const visible = blocks.some((block) => this.ranks.get(block.id.value) === 0);

    if (!visible) return this.translateSlots(blocks, session, policy, signal);

    this.visibleFallbacks += 1;

    try {
      return await this.translateSlots(blocks, session, policy, signal);
    } finally {
      this.visibleFallbacks -= 1;
    }
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

  private setView(state: ViewState): void {
    this.view = state;

    for (const listener of this.listeners) listener(state);
  }
}
