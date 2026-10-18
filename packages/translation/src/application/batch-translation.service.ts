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
import type { ProviderError } from "../domain/provider/provider-error";
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

export interface BatchTranslationDeps {
  provider: TranslationProvider;
  cache: TranslationCache;
  hasher: Hasher;
  prompt: PromptAdapter;
  contextTokens: number;
  maxSegmentsPerBatch: number;
}

interface Piece {
  nodes: InlineNode[];
  markup: string;
  separator: string;
}

type PieceResult = Result<string, SegmentFailureCode>;

type PieceResults = Map<Piece, PieceResult>;

interface KeyedSegment {
  segment: SegmentRequest;
  key: string;
}

interface CachedEntry extends KeyedSegment {
  kind: "hit";
  markup: string;
}

interface PlannedEntry extends KeyedSegment {
  kind: "miss";
  plan: Result<Piece[], SegmentFailureCode>;
}

type Entry = CachedEntry | PlannedEntry;

interface KeyedOutcome {
  key: string;
  outcome: SegmentOutcome;
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

function outcomeOf(entry: Entry, results: PieceResults): SegmentOutcome {
  const id = entry.segment.id;

  if (entry.kind === "hit") {
    return { id, status: "translated", markup: entry.markup, fromCache: true };
  }

  return entry.plan
    .flatMap((pieces) => joinPieces(pieces, results))
    .match<SegmentOutcome>({
      ok: (markup) => ({ id, status: "translated", markup, fromCache: false }),
      fail: (code) => ({ id, status: "failed", code }),
    });
}

export class BatchTranslationService {
  public constructor(private readonly deps: BatchTranslationDeps) {}

  public async translate(request: BatchRequest): Promise<Result<SegmentOutcome[], ProviderError>> {
    const keyed = await Promise.all(
      request.segments.map(async (segment) => ({
        segment,
        key: await this.keyOf(segment, request),
      })),
    );
    const cached = await this.readCache(keyed, request.cachePolicy);
    const budget = this.inputBudget(request);
    const pieceBudget = budget - this.wrapperTokens();
    const entries = keyed.map((entry): Entry => {
      const markup = cached.get(entry.key);

      if (markup !== undefined) return { ...entry, kind: "hit", markup };

      return { ...entry, kind: "miss", plan: this.planPieces(entry.segment, pieceBudget) };
    });
    const pieces = entries.flatMap((entry) =>
      entry.kind === "miss" ? entry.plan.unwrapOr([]) : [],
    );
    const translated = await this.translatePieces(pieces, budget, request);

    if (translated.isFailure) return Result.fail(translated.getError());

    const outcomes = entries.map((entry) => ({
      key: entry.key,
      outcome: outcomeOf(entry, translated.getValue()),
    }));

    await this.writeCache(outcomes);

    return Result.ok(outcomes.map(({ outcome }) => outcome));
  }

  private keyOf(segment: SegmentRequest, request: BatchRequest): Promise<string> {
    return this.deps.hasher.sha256Hex(
      cacheKey({
        sourceMarkup: segment.markup,
        source: request.source,
        target: request.target,
        providerId: this.deps.provider.id,
        model: this.deps.provider.model,
        promptVersion: PROMPT_VERSION,
      }),
    );
  }

  private async readCache(
    keyed: KeyedSegment[],
    policy: CachePolicy,
  ): Promise<Map<string, string>> {
    if (policy === "refresh" || keyed.length === 0) return new Map();

    return this.deps.cache.getMany(keyed.map(({ key }) => key));
  }

  private async writeCache(outcomes: KeyedOutcome[]): Promise<void> {
    const entries = new Map<string, string>();

    for (const { key, outcome } of outcomes) {
      if (outcome.status === "translated" && !outcome.fromCache) entries.set(key, outcome.markup);
    }

    if (entries.size === 0) return;

    await this.deps.cache.setMany(entries);
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

  private planPieces(segment: SegmentRequest, budget: number): Result<Piece[], SegmentFailureCode> {
    return parseMarkup(segment.markup)
      .mapError((error): SegmentFailureCode => error.code)
      .flatMap((nodes) =>
        splitNodes(nodes, budget).mapError((error): SegmentFailureCode => error.code),
      )
      .map((parts) =>
        parts.map((nodes, index) => ({
          nodes,
          markup: toMarkup(nodes),
          separator: separatorBetween(parts[index - 1], nodes),
        })),
      );
  }

  private async translatePieces(
    pieces: Piece[],
    budget: number,
    request: BatchRequest,
  ): Promise<Result<PieceResults, ProviderError>> {
    const numbered = pieces.map((piece, index) => ({ n: index + 1, markup: piece.markup }));
    const batches = planBatches(numbered, budget, this.deps.maxSegmentsPerBatch);
    const results: PieceResults = new Map();

    for (const batch of batches) {
      const members = batch.flatMap(({ n }) => pieces[n - 1] ?? []);
      const attempt = await this.attempt(members, request);

      if (attempt.isFailure) return Result.fail(attempt.getError());

      for (const [piece, result] of attempt.getValue()) {
        if (result.isSuccess) {
          results.set(piece, result);
          continue;
        }

        const retry = await this.attempt([piece], request);

        if (retry.isFailure) return Result.fail(retry.getError());

        results.set(piece, retry.getValue().get(piece) ?? result);
      }
    }

    return Result.ok(results);
  }

  private async attempt(
    pieces: Piece[],
    request: BatchRequest,
  ): Promise<Result<PieceResults, ProviderError>> {
    const messages = this.deps.prompt.build({
      source: request.source,
      target: request.target,
      brief: request.brief,
      segments: pieces.map((piece, index) => ({ n: index + 1, markup: piece.markup })),
    });
    const response = await this.deps.provider.chat(messages, {
      contextTokens: this.deps.contextTokens,
    });

    return response.map((text) => {
      const decoded = decodeBatch(text);

      return new Map(
        pieces.map((piece, index) => [piece, validate(piece, decoded.get(index + 1))]),
      );
    });
  }
}
