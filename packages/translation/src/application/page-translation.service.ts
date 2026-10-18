import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { Block } from "../domain/block/block";
import { type BlockTranslation, textSlots } from "../domain/block/block-translation";
import type { InlineNode } from "../domain/block/inline-node";
import type { CachePolicy } from "../domain/cache/cache-policy";
import { shouldSkipBlock } from "../domain/language/skip-policy";
import type { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import { parseMarkup, toMarkup } from "../domain/markup/markup";
import type { PageBrief } from "../domain/page/page-brief";
import { type ProviderError, providerError } from "../domain/provider/provider-error";
import { type ProximityRank, TranslationQueue } from "../domain/queue/translation-queue";
import type { SegmentOutcome, SegmentRequest } from "./batch-translation.service";
import type { BatchTranslator } from "./ports/batch-translator";
import type { LanguageDetector } from "./ports/language-detector";
import type { PageSurface } from "./ports/page-surface";

export type ViewState =
  | { kind: "original" }
  | { kind: "translating" }
  | { kind: "translated" }
  | { kind: "error"; error: ProviderError };

export interface PageTranslationDeps {
  surface: PageSurface;
  translator: BatchTranslator;
  detector: LanguageDetector;
  target: LanguageCode;
  maxSegmentsPerRequest: number;
}

type StateListener = (state: ViewState) => void;

interface Session {
  brief: PageBrief;
  source: Option<LanguageCode>;
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

function chunks<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, size);

  return Array.from({ length: Math.ceil(items.length / step) }, (_, index) =>
    items.slice(index * step, (index + 1) * step),
  );
}

export class PageTranslationService {
  private view: ViewState = { kind: "original" };
  private readonly listeners = new Set<StateListener>();
  private readonly queue = new TranslationQueue();
  private readonly blocks = new Map<string, Block>();
  private readonly ranks = new Map<string, ProximityRank>();
  private readonly reported = new Set<string>();
  private readonly settled = new Set<string>();
  private readonly inFlight = new Set<string>();
  private session: Session | undefined;
  private started = false;
  private cachePolicy: CachePolicy = "use";
  private epoch = 0;
  private pumping = false;
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
    this.cachePolicy = "refresh";

    if (!this.started) return this.start();

    this.epoch += 1;
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

    this.session = { brief, source: source.getValue() };
    this.addBlocks(this.deps.surface.scan());
    this.deps.surface.watch({
      onBlocks: (blocks) => {
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

  private showOriginal(): void {
    this.epoch += 1;
    this.deps.surface.show("original");
    this.setView({ kind: "original" });
  }

  private resume(): void {
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
      this.settled.delete(key);
      this.enqueueIfPending(key);
    }
  }

  private forget(key: string): void {
    this.blocks.delete(key);
    this.ranks.delete(key);
    this.reported.delete(key);
    this.settled.delete(key);
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

    this.queue.enqueue(block.id, rank);
  }

  private canPump(): boolean {
    return this.view.kind === "translating" || this.view.kind === "translated";
  }

  private schedule(): void {
    const session = this.session;

    if (this.pumping || session === undefined || !this.canPump()) return;

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

    while (this.canPump()) {
      const ids = this.queue.take(Math.max(1, this.deps.maxSegmentsPerRequest));

      if (ids.length === 0) break;

      const processed = await this.process(
        ids.flatMap((id) => this.blocks.get(id.value) ?? []),
        session,
      );

      if (processed.isFailure) return Option.some(processed.getError());
    }

    return Option.none();
  }

  private async process(batch: Block[], session: Session): Promise<Result<void, ProviderError>> {
    const epoch = this.epoch;

    for (const block of batch) this.inFlight.add(block.id.value);

    const plan = await settle(this.translateBatch(batch, session));

    for (const block of batch) this.inFlight.delete(block.id.value);

    if (epoch !== this.epoch || plan.isFailure) {
      for (const block of batch) this.enqueueIfPending(block.id.value);

      return epoch === this.epoch ? Result.fail(plan.getError()) : Result.ok();
    }

    this.apply(plan.getValue());

    return Result.ok();
  }

  private apply(plan: BatchPlan): void {
    for (const block of plan.settled) this.settled.add(block.id.value);

    for (const translation of plan.translations) {
      const committed = this.deps.surface.commit(translation);

      if (committed.isFailure) this.forget(translation.blockId.value);
    }
  }

  private async translateBatch(
    batch: Block[],
    session: Session,
  ): Promise<Result<BatchPlan, ProviderError>> {
    const skips = await Promise.all(batch.map((block) => this.isInTargetLanguage(block)));
    const sendable = batch.filter((_, index) => skips[index] !== true);

    if (sendable.length === 0) return Result.ok({ translations: [], settled: batch });

    const structured = await this.request(
      sendable.map((block, index) => ({ id: `${index}`, markup: toMarkup(block.nodes) })),
      session,
    );

    if (structured.isFailure) return Result.fail(structured.getError());

    const translations: BlockTranslation[] = [];
    const fallback: Block[] = [];

    sendable.forEach((block, index) => {
      const nodes = structuredNodes(structured.getValue().get(`${index}`));

      if (nodes.isNone()) {
        fallback.push(block);

        return;
      }

      translations.push({ blockId: block.id, kind: "structured", nodes: nodes.unwrap() });
    });

    const slotted = await this.translateSlots(fallback, session);

    return slotted.map((slotTranslations) => ({
      translations: [...translations, ...slotTranslations],
      settled: batch,
    }));
  }

  private async translateSlots(
    blocks: Block[],
    session: Session,
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
      const result = await this.request(chunk, session);

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

  private async request(
    segments: SegmentRequest[],
    session: Session,
  ): Promise<Result<Outcomes, ProviderError>> {
    const result = await this.deps.translator.translate({
      segments,
      source: session.source,
      target: this.deps.target,
      brief: session.brief,
      cachePolicy: this.cachePolicy,
    });

    return result.map((outcomes) => new Map(outcomes.map((outcome) => [outcome.id, outcome])));
  }

  private setView(state: ViewState): void {
    this.view = state;

    for (const listener of this.listeners) listener(state);
  }
}
