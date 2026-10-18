import type { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { decodeBatch, encodeBatch } from "../domain/batch/batch-format";
import { estimateTokens, maxInputTokens, planBatches } from "../domain/batch/budget";
import { splitNodes } from "../domain/batch/split";
import type { InlineNode } from "../domain/block/inline-node";
import { cacheKey } from "../domain/cache/cache-key";
import type { CachePolicy } from "../domain/cache/cache-policy";
import type { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import { type MarkupErrorCode, parseMarkup, toMarkup } from "../domain/markup/markup";
import { checkAgainstSource } from "../domain/markup/structure-check";
import type { PageBrief } from "../domain/page/page-brief";
import type { PromptAdapter } from "../domain/prompt/prompt-adapter";
import { PROMPT_VERSION } from "../domain/prompt/prompt-version";
import { type ProviderError, requestCancelled } from "../domain/provider/provider-error";
import type { Hasher } from "./ports/hasher";
import type { TranslationCache } from "./ports/translation-cache";
import type { TranslationProvider } from "./ports/translation-provider";

export interface SegmentRequest {
  id: string;
  markup: string;
}

export interface BatchRequest {
  segments: SegmentRequest[];
  source: Option<LanguageCode>;
  target: LanguageCode;
  brief: PageBrief;
  cachePolicy: CachePolicy;
}

export type SegmentFailureCode = MarkupErrorCode | "SEGMENT_TOO_LONG" | "RESPONSE_MISSING_SEGMENT";

export type SegmentOutcome =
  | { id: string; status: "translated"; markup: string; fromCache: boolean }
  | { id: string; status: "failed"; code: SegmentFailureCode };

export interface BatchTranslateOptions {
  onOutcome?: (outcome: SegmentOutcome) => void;
  signal?: AbortSignal;
}

export interface BatchTranslationDeps {
  provider: TranslationProvider;
  cache: TranslationCache;
  hasher: Hasher;
  prompt: PromptAdapter;
  contextTokens: number;
  maxSegmentsPerBatch: number;
}

interface SegmentGroup {
  key: string;
  markup: string;
  ids: string[];
}

interface Piece {
  group: SegmentGroup;
  nodes: InlineNode[];
  markup: string;
  separator: string;
}

type PieceResult = Result<string, SegmentFailureCode>;

type PieceResults = Map<Piece, PieceResult>;

type GroupResult = Result<{ markup: string; fromCache: boolean }, SegmentFailureCode>;

interface PiecePlan {
  outer: number[];
  pieces: Piece[];
}

interface Peeled {
  outer: number[];
  inner: InlineNode[];
}

function peel(nodes: InlineNode[]): Peeled {
  const outer: number[] = [];
  let inner = nodes;

  for (;;) {
    const [only] = inner;

    if (inner.length !== 1 || only?.kind !== "group" || only.children.length === 0) {
      return { outer, inner };
    }

    outer.push(only.key);
    inner = only.children;
  }
}

function rewrap(outer: number[], markup: string): PieceResult {
  if (outer.length === 0) return Result.ok(markup);

  return parseMarkup(markup)
    .map((nodes) =>
      toMarkup(
        outer.reduceRight<InlineNode[]>(
          (children, key) => [{ kind: "group", key, children }],
          nodes,
        ),
      ),
    )
    .mapError((error): SegmentFailureCode => error.code);
}

function validate(piece: Piece, response: string | undefined): PieceResult {
  if (response === undefined) return Result.fail("RESPONSE_MISSING_SEGMENT");

  return parseMarkup(response)
    .flatMap((nodes) => checkAgainstSource(piece.nodes, nodes))
    .map(toMarkup)
    .mapError((error): SegmentFailureCode => error.code);
}

const EDGE_SPACE_END = /[ \t\n\f\r]$/;

const EDGE_SPACE_START = /^[ \t\n\f\r]/;

function separatorBetween(previous: InlineNode[] | undefined, next: InlineNode[]): string {
  if (previous === undefined) return "";

  const last = previous.at(-1);
  const first = next[0];
  const spaceBefore = last?.kind === "text" && EDGE_SPACE_END.test(last.text);
  const spaceAfter = first?.kind === "text" && EDGE_SPACE_START.test(first.text);

  return spaceBefore || spaceAfter ? " " : "";
}

function joinPieces(pieces: Piece[], results: PieceResults): PieceResult {
  let translated = "";

  for (const piece of pieces) {
    const result = results.get(piece);

    if (result === undefined) return Result.fail("RESPONSE_MISSING_SEGMENT");

    if (result.isFailure) return Result.fail(result.getError());

    translated += piece.separator + result.getValue();
  }

  return Result.ok(translated);
}

function outcomeOf(id: string, result: GroupResult | undefined): SegmentOutcome {
  if (result === undefined) return { id, status: "failed", code: "RESPONSE_MISSING_SEGMENT" };

  return result.match<SegmentOutcome>({
    ok: ({ markup, fromCache }) => ({ id, status: "translated", markup, fromCache }),
    fail: (code) => ({ id, status: "failed", code }),
  });
}

class BatchRun {
  private readonly plans = new Map<SegmentGroup, PiecePlan>();
  private readonly pieces: PieceResults = new Map();
  private readonly settled = new Map<SegmentGroup, GroupResult>();
  private readonly writes: Promise<void>[] = [];

  public constructor(
    private readonly cache: TranslationCache,
    private readonly onOutcome: (outcome: SegmentOutcome) => void,
  ) {}

  public plan(group: SegmentGroup, plan: PiecePlan): void {
    this.plans.set(group, plan);
  }

  public isSettled(group: SegmentGroup): boolean {
    return this.settled.has(group);
  }

  public settle(group: SegmentGroup, result: GroupResult): void {
    if (this.settled.has(group)) return;

    this.settled.set(group, result);

    if (result.isSuccess && !result.getValue().fromCache) {
      this.writes.push(this.cache.setMany(new Map([[group.key, result.getValue().markup]])));
    }

    for (const id of group.ids) this.onOutcome(outcomeOf(id, result));
  }

  public record(piece: Piece, result: PieceResult, final: boolean): void {
    const { group } = piece;

    if (this.settled.has(group)) return;

    if (result.isFailure) {
      if (final) this.settle(group, Result.fail(result.getError()));

      return;
    }

    this.pieces.set(piece, result);

    const { outer, pieces } = this.plans.get(group) ?? { outer: [], pieces: [piece] };

    if (!pieces.every((member) => this.pieces.get(member)?.isSuccess)) return;

    this.settle(
      group,
      joinPieces(pieces, this.pieces)
        .flatMap((markup) => rewrap(outer, markup))
        .map((markup) => ({ markup, fromCache: false })),
    );
  }

  public outcomes(groups: SegmentGroup[], segments: SegmentRequest[]): SegmentOutcome[] {
    const byMarkup = new Map(groups.map((group) => [group.markup, group]));

    return segments.map((segment) => {
      const group = byMarkup.get(segment.markup);

      return outcomeOf(segment.id, group && this.settled.get(group));
    });
  }

  public async flushed(): Promise<void> {
    await Promise.all(this.writes);
  }
}

function streamedSegments(pieces: Piece[], run: BatchRun): (delta: string) => void {
  const seen = new Set<number>();
  let streamed = "";

  return (delta) => {
    streamed += delta;

    if (!delta.includes(">")) return;

    for (const [n, markup] of decodeBatch(streamed)) {
      const piece = pieces[n - 1];

      if (seen.has(n) || piece === undefined) continue;

      seen.add(n);

      const result = validate(piece, markup);

      if (result.isSuccess) run.record(piece, result, false);
    }
  };
}

const ignoreOutcome = (): void => undefined;

export class BatchTranslationService {
  public constructor(private readonly deps: BatchTranslationDeps) {}

  public async translate(
    request: BatchRequest,
    options: BatchTranslateOptions = {},
  ): Promise<Result<SegmentOutcome[], ProviderError>> {
    const groups = await this.groupsOf(request);
    const cached = await this.readCache(groups, request.cachePolicy);
    const run = new BatchRun(this.deps.cache, options.onOutcome ?? ignoreOutcome);
    const budget = this.inputBudget(request);
    const pieceBudget = budget - this.wrapperTokens();
    const pieces: Piece[] = [];

    for (const group of groups) {
      const markup = cached.get(group.key);

      if (markup !== undefined) {
        run.settle(group, Result.ok({ markup, fromCache: true }));
        continue;
      }

      const plan = this.planPieces(group, pieceBudget);

      if (plan.isFailure) {
        run.settle(group, Result.fail(plan.getError()));
        continue;
      }

      run.plan(group, plan.getValue());
      pieces.push(...plan.getValue().pieces);
    }

    const translated = await this.translatePieces(pieces, budget, request, run, options.signal);

    await run.flushed();

    if (translated.isFailure) return Result.fail(translated.getError());

    return Result.ok(run.outcomes(groups, request.segments));
  }

  private groupsOf(request: BatchRequest): Promise<SegmentGroup[]> {
    const idsByMarkup = new Map<string, string[]>();

    for (const { id, markup } of request.segments) {
      idsByMarkup.set(markup, [...(idsByMarkup.get(markup) ?? []), id]);
    }

    return Promise.all(
      [...idsByMarkup].map(async ([markup, ids]) => ({
        key: await this.keyOf(markup, request),
        markup,
        ids,
      })),
    );
  }

  private keyOf(markup: string, request: BatchRequest): Promise<string> {
    return this.deps.hasher.sha256Hex(
      cacheKey({
        sourceMarkup: markup,
        source: request.source,
        target: request.target,
        providerId: this.deps.provider.id,
        model: this.deps.provider.model,
        promptVersion: PROMPT_VERSION,
      }),
    );
  }

  private async readCache(
    groups: SegmentGroup[],
    policy: CachePolicy,
  ): Promise<Map<string, string>> {
    if (policy === "refresh" || groups.length === 0) return new Map();

    return this.deps.cache.getMany(groups.map(({ key }) => key));
  }

  private inputBudget(request: BatchRequest): number {
    const overhead = this.deps.prompt.overheadTokens({
      source: request.source,
      target: request.target,
      brief: request.brief,
    });

    return maxInputTokens(this.deps.contextTokens, overhead);
  }

  private wrapperTokens(): number {
    return estimateTokens(encodeBatch([{ n: this.deps.maxSegmentsPerBatch, markup: "" }]));
  }

  private planPieces(group: SegmentGroup, budget: number): Result<PiecePlan, SegmentFailureCode> {
    return parseMarkup(group.markup)
      .mapError((error): SegmentFailureCode => error.code)
      .flatMap((nodes) => {
        const { outer, inner } = peel(nodes);

        return splitNodes(inner, budget)
          .mapError((error): SegmentFailureCode => error.code)
          .map((parts) => ({
            outer,
            pieces: parts.map((part, index) => ({
              group,
              nodes: part,
              markup: toMarkup(part),
              separator: separatorBetween(parts[index - 1], part),
            })),
          }));
      });
  }

  private async translatePieces(
    pieces: Piece[],
    budget: number,
    request: BatchRequest,
    run: BatchRun,
    signal: AbortSignal | undefined,
  ): Promise<Result<void, ProviderError>> {
    const numbered = pieces.map((piece, index) => ({ n: index + 1, markup: piece.markup }));
    const batches = planBatches(numbered, budget, this.deps.maxSegmentsPerBatch);

    for (const batch of batches) {
      const members = batch.flatMap(({ n }) => pieces[n - 1] ?? []);
      const attempt = await this.attempt(members, request, run, signal);

      if (attempt.isFailure) return Result.fail(attempt.getError());

      for (const [piece, result] of attempt.getValue()) {
        if (result.isSuccess || run.isSettled(piece.group)) {
          run.record(piece, result, true);
          continue;
        }

        const retry = await this.attempt([piece], request, run, signal);

        if (retry.isFailure) return Result.fail(retry.getError());

        run.record(piece, retry.getValue().get(piece) ?? result, true);
      }
    }

    return Result.ok();
  }

  private async attempt(
    pieces: Piece[],
    request: BatchRequest,
    run: BatchRun,
    signal: AbortSignal | undefined,
  ): Promise<Result<PieceResults, ProviderError>> {
    if (signal?.aborted) return Result.fail(requestCancelled());

    const messages = this.deps.prompt.build({
      source: request.source,
      target: request.target,
      brief: request.brief,
      segments: pieces.map((piece, index) => ({ n: index + 1, markup: piece.markup })),
    });
    const response = await this.deps.provider.chat(messages, {
      contextTokens: this.deps.contextTokens,
      signal,
      onText: streamedSegments(pieces, run),
    });

    return response.map((text) => {
      const decoded = decodeBatch(text);

      return new Map(
        pieces.map((piece, index) => [piece, validate(piece, decoded.get(index + 1))]),
      );
    });
  }
}
