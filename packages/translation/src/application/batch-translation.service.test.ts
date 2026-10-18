import { describe, expect, mock, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { decodeBatch, encodeBatch } from "../domain/batch/batch-format";
import { estimateTokens, maxInputTokens } from "../domain/batch/budget";
import type { InlineNode } from "../domain/block/inline-node";
import { cacheKey } from "../domain/cache/cache-key";
import type { CachePolicy } from "../domain/cache/cache-policy";
import { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import { toMarkup } from "../domain/markup/markup";
import type { PageBrief } from "../domain/page/page-brief";
import type { ChatMessage } from "../domain/prompt/prompt-adapter";
import { PROMPT_VERSION } from "../domain/prompt/prompt-version";
import { translateGemmaPrompt } from "../domain/prompt/translategemma-prompt";
import { type ProviderError, providerError } from "../domain/provider/provider-error";
import {
  type BatchRequest,
  BatchTranslationService,
  type SegmentRequest,
} from "./batch-translation.service";

const CONTEXT_TOKENS = 2048;

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const source = Option.some(language("en"));

const target = language("fr");

const brief: PageBrief = {
  host: "github.com",
  title: "About forks",
  description: "A fork is a new repository that shares code with an upstream repository.",
  headings: ["About forks"],
  sourceLanguage: source,
};

const inputBudget = maxInputTokens(
  CONTEXT_TOKENS,
  translateGemmaPrompt.overheadTokens({ source, target, brief }),
);

const sentBatch = (messages: ChatMessage[]): string => {
  const content = messages.at(-1)?.content ?? "";

  return content.slice(content.lastIndexOf("\n\n\n") + 3);
};

const echo =
  (translate: (markup: string) => string) =>
  async (messages: ChatMessage[]): Promise<Result<string, ProviderError>> => {
    const segments = [...decodeBatch(sentBatch(messages))].map(([n, markup]) => ({
      n,
      markup: translate(markup),
    }));

    return Result.ok(encodeBatch(segments));
  };

const french = (markup: string): string => `fr: ${markup}`;

const seg = (markup: string): string => `<seg n="1">${markup}</seg>`;

const sentences = (count: number): string =>
  Array.from({ length: count }, (_, index) => `Sentence ${index + 1} talks about forks.`).join(" ");

function setup(options: { cached?: Map<string, string>; maxSegmentsPerBatch?: number } = {}) {
  const provider = {
    id: "ollama",
    model: "translategemma:12b",
    chat: mock(echo(french)),
  };
  const cache = {
    getMany: mock(async (_keys: string[]) => new Map(options.cached)),
    setMany: mock(async (_entries: Map<string, string>) => {}),
  };
  const hasher = { sha256Hex: mock(async (input: string) => `sha(${input})`) };
  const service = new BatchTranslationService({
    provider,
    cache,
    hasher,
    prompt: translateGemmaPrompt,
    contextTokens: CONTEXT_TOKENS,
    maxSegmentsPerBatch: options.maxSegmentsPerBatch ?? 8,
  });

  const written = (): Map<string, string> =>
    new Map(cache.setMany.mock.calls.flatMap(([entries]) => [...entries]));

  const batchesSent = (): string[] =>
    provider.chat.mock.calls.map(([messages]) => sentBatch(messages));

  return { provider, cache, service, written, batchesSent };
}

const keyOf = (markup: string): string =>
  `sha(${cacheKey({
    sourceMarkup: markup,
    source,
    target,
    providerId: "ollama",
    model: "translategemma:12b",
    promptVersion: PROMPT_VERSION,
  })})`;

const request = (segments: SegmentRequest[], cachePolicy: CachePolicy = "use"): BatchRequest => ({
  segments,
  source,
  target,
  brief,
  cachePolicy,
});

const RUN = "Run <x1/> now.";

describe("BatchTranslationService", () => {
  test("cache_hit_returns_cached_markup_and_makes_no_provider_call", async () => {
    const { provider, service, written } = setup({
      cached: new Map([[keyOf(RUN), "Lancez <x1/> maintenant."]]),
    });

    const result = await service.translate(request([{ id: "a", markup: RUN }]));

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "Lancez <x1/> maintenant.", fromCache: true },
    ]);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(written().size).toBe(0);
  });

  test("cache_miss_translates_validates_and_stores", async () => {
    const { service, written } = setup();

    const result = await service.translate(request([{ id: "a", markup: RUN }]));

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: `fr: ${RUN}`, fromCache: false },
    ]);
    expect(written()).toEqual(new Map([[keyOf(RUN), `fr: ${RUN}`]]));
  });

  test("refresh_policy_ignores_cached_value_and_overwrites_it", async () => {
    const { provider, service, written } = setup({
      cached: new Map([[keyOf(RUN), "stale <x1/>"]]),
    });

    const result = await service.translate(request([{ id: "a", markup: RUN }], "refresh"));

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: `fr: ${RUN}`, fromCache: false },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(written()).toEqual(new Map([[keyOf(RUN), `fr: ${RUN}`]]));
  });

  test("lost_placeholder_is_retried_alone_then_succeeds", async () => {
    const { provider, service, written } = setup();
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Lancez maintenant.")));
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Lancez <x1/> maintenant.")));

    const result = await service.translate(request([{ id: "a", markup: RUN }]));

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "Lancez <x1/> maintenant.", fromCache: false },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(written()).toEqual(new Map([[keyOf(RUN), "Lancez <x1/> maintenant."]]));
  });

  test("lost_placeholder_twice_yields_failed_PLACEHOLDER_LOST_and_caches_nothing_for_it", async () => {
    const { provider, service, written } = setup();
    provider.chat.mockResolvedValueOnce(
      Result.ok('<seg n="1">Lancez maintenant.</seg>\n<seg n="2">Bonjour.</seg>'),
    );
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Lancez maintenant.")));

    const result = await service.translate(
      request([
        { id: "a", markup: RUN },
        { id: "b", markup: "Hello." },
      ]),
    );

    expect(result.getValue()).toEqual([
      { id: "a", status: "failed", code: "PLACEHOLDER_LOST" },
      { id: "b", status: "translated", markup: "Bonjour.", fromCache: false },
    ]);
    expect(written()).toEqual(new Map([[keyOf("Hello."), "Bonjour."]]));
  });

  test("duplicated_placeholder_is_rejected", async () => {
    const { provider, service, written } = setup();
    provider.chat.mockResolvedValue(Result.ok(seg("Lancez <x1/> <x1/> maintenant.")));

    const result = await service.translate(request([{ id: "a", markup: RUN }]));

    expect(result.getValue()).toEqual([
      { id: "a", status: "failed", code: "PLACEHOLDER_DUPLICATED" },
    ]);
    expect(written().size).toBe(0);
  });

  test("group_moved_out_of_parent_is_failed_STRUCTURE_MOVED_after_one_retry", async () => {
    const { provider, service } = setup();
    provider.chat.mockResolvedValue(Result.ok(seg("Voir <g1>le guide</g1> <x1/>.")));

    const result = await service.translate(
      request([{ id: "a", markup: "See <g1>the <x1/> guide</g1>." }]),
    );

    expect(result.getValue()).toEqual([{ id: "a", status: "failed", code: "STRUCTURE_MOVED" }]);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  test("oversized_segment_is_split_translated_in_pieces_and_joined_in_order", async () => {
    const { provider, service, written, batchesSent } = setup();
    provider.chat.mockImplementation(echo((markup) => markup));
    const nodes: InlineNode[] = [
      { kind: "text", text: `${sentences(150)} See ` },
      { kind: "group", key: 1, children: [{ kind: "text", text: "the guide" }] },
      { kind: "text", text: " and run " },
      { kind: "atom", key: 1 },
      { kind: "text", text: `. ${sentences(150)}` },
    ];
    const markup = toMarkup(nodes);
    expect(markup.length).toBeGreaterThan(9000);

    const result = await service.translate(request([{ id: "a", markup }]));

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup, fromCache: false },
    ]);
    expect(batchesSent().length).toBeGreaterThan(1);

    for (const batch of batchesSent())
      expect(estimateTokens(batch)).toBeLessThanOrEqual(inputBudget);

    expect(written()).toEqual(new Map([[keyOf(markup), markup]]));
  });

  test("word_longer_than_the_budget_is_cut_and_rejoined_without_an_inserted_space", async () => {
    const { provider, service, batchesSent } = setup();
    provider.chat.mockImplementation(echo((markup) => markup));
    const markup = `Download ${"x".repeat(4000)} now.`;

    const result = await service.translate(request([{ id: "a", markup }]));

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup, fromCache: false },
    ]);
    expect(batchesSent().length).toBeGreaterThan(1);
  });

  test("unsplittable_segment_is_failed_SEGMENT_TOO_LONG_without_provider_call", async () => {
    const { provider, service, written } = setup();
    const markup = toMarkup([
      { kind: "group", key: 1, children: [{ kind: "text", text: sentences(250) }] },
    ]);

    const result = await service.translate(request([{ id: "a", markup }]));

    expect(result.getValue()).toEqual([{ id: "a", status: "failed", code: "SEGMENT_TOO_LONG" }]);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(written().size).toBe(0);
  });

  test("missing_segment_in_response_is_retried_alone", async () => {
    const { provider, service, written, batchesSent } = setup();
    provider.chat.mockResolvedValueOnce(Result.ok('<seg n="2">Bonjour.</seg>'));

    const result = await service.translate(
      request([
        { id: "a", markup: RUN },
        { id: "b", markup: "Hello." },
      ]),
    );

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: `fr: ${RUN}`, fromCache: false },
      { id: "b", status: "translated", markup: "Bonjour.", fromCache: false },
    ]);
    expect(batchesSent()).toContain(seg(RUN));
    expect(written()).toEqual(
      new Map([
        [keyOf(RUN), `fr: ${RUN}`],
        [keyOf("Hello."), "Bonjour."],
      ]),
    );
  });

  test("provider_forbidden_fails_the_whole_call_with_PROVIDER_FORBIDDEN_ORIGIN_and_writes_nothing", async () => {
    const { provider, service, written } = setup({ maxSegmentsPerBatch: 1 });
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Bonjour.")));
    provider.chat.mockResolvedValueOnce(
      Result.fail(providerError("PROVIDER_FORBIDDEN_ORIGIN", "Ollama refused the origin.")),
    );

    const result = await service.translate(
      request([
        { id: "a", markup: "Hello." },
        { id: "b", markup: RUN },
      ]),
    );

    expect(result.getError().code).toBe("PROVIDER_FORBIDDEN_ORIGIN");
    expect(written().size).toBe(0);
  });

  test("ten_segments_at_the_budget_boundary_never_exceed_max_input_tokens", async () => {
    const { provider, service, batchesSent } = setup({ maxSegmentsPerBatch: 100 });
    provider.chat.mockImplementation(echo((markup) => markup));
    const zeroBasedWrappers = encodeBatch(
      Array.from({ length: 10 }, (_, n) => ({ n, markup: "" })),
    );
    const markupChars = inputBudget * 3 - zeroBasedWrappers.length;
    const segments = Array.from({ length: 10 }, (_, index) => ({
      id: `s${index}`,
      markup: "a".repeat(Math.floor(markupChars / 10) + (index < markupChars % 10 ? 1 : 0)),
    }));

    const result = await service.translate(request(segments));

    expect(result.getValue().every((outcome) => outcome.status === "translated")).toBe(true);

    for (const batch of batchesSent()) {
      expect(estimateTokens(batch)).toBeLessThanOrEqual(inputBudget);
    }
  });

  test("segments_are_grouped_into_batches_under_the_context_budget", async () => {
    const { service, batchesSent } = setup({ maxSegmentsPerBatch: 100 });
    const segments = Array.from({ length: 40 }, (_, index) => ({
      id: `s${index}`,
      markup: `Paragraph ${String(index).padStart(2, "0")} ${"word ".repeat(58)}end.`,
    }));

    const result = await service.translate(request(segments));

    expect(result.getValue().every((outcome) => outcome.status === "translated")).toBe(true);
    expect(batchesSent()).toHaveLength(7);

    for (const batch of batchesSent())
      expect(estimateTokens(batch)).toBeLessThanOrEqual(inputBudget);
  });
});
