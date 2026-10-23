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
import {
  type ProviderError,
  providerError,
  requestCancelled,
} from "../domain/provider/provider-error";
import {
  type BatchRequest,
  BatchTranslationService,
  type SegmentOutcome,
  type SegmentRequest,
} from "./batch-translation.service";
import type { ChatOptions } from "./ports/translation-provider";

const CONTEXT_TOKENS = 2048;

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const source = Option.some(language("en"));

const target = language("fr");

const brief: PageBrief = {
  host: "github.com",
  url: "https://github.com/about-forks",
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

const seg = (markup: string): string => `[1] ${markup}`;

const sentences = (count: number): string =>
  Array.from({ length: count }, (_, index) => `Sentence ${index + 1} talks about forks.`).join(" ");

function setup(options: { cached?: Map<string, string>; maxSegmentsPerBatch?: number } = {}) {
  const provider = {
    id: "ollama",
    model: "translategemma:12b",
    chat: mock((messages: ChatMessage[], _options: ChatOptions) => echo(french)(messages)),
  };
  const store = new Map(options.cached);
  const cache = {
    getMany: mock(async (keys: string[]) => {
      const found = new Map<string, string>();

      for (const key of keys) {
        const value = store.get(key);

        if (value !== undefined) found.set(key, value);
      }

      return found;
    }),
    setMany: mock(async (entries: Map<string, string>) => {
      for (const [key, value] of entries) store.set(key, value);
    }),
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
    host: brief.host,
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

const streaming =
  (deltas: string[], onDelta: () => void = () => {}) =>
  async (
    _messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<Result<string, ProviderError>> => {
    for (const delta of deltas) {
      options.onText?.(delta);
      onDelta();
    }

    return Result.ok(deltas.join(""));
  };

const emitted = () => mock((_outcome: SegmentOutcome) => {});

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

  test("invented_atom_on_plain_text_is_retried_alone_then_succeeds", async () => {
    const { provider, service, written } = setup();
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Bonjour <x2/>.")));
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Bonjour.")));

    const result = await service.translate(request([{ id: "a", markup: "Hello." }]));

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "Bonjour.", fromCache: false },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(written()).toEqual(new Map([[keyOf("Hello."), "Bonjour."]]));
  });

  test("merged_adjacent_links_keep_the_first_and_text_of_both", async () => {
    const { provider, service, written } = setup();
    const source = "Read <g1>the docs</g1> and <g2>the guides</g2> of <g3>the API</g3> first.";
    const merged = "Lisez <g1>la documentation et les guides</g1> de <g3>l'API</g3> d'abord.";
    provider.chat.mockResolvedValueOnce(Result.ok(seg(merged)));

    const result = await service.translate(request([{ id: "a", markup: source }]));

    expect(result.getValue()).toEqual([
      {
        id: "a",
        status: "translated",
        markup: merged,
        fromCache: false,
        lostGroups: 1,
      },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(written()).toEqual(new Map([[keyOf(source), merged]]));
  });

  test("missing_group_keeps_translated_text_as_plain_text", async () => {
    const { provider, service } = setup();
    provider.chat.mockResolvedValueOnce(
      Result.ok(seg("Lisez la documentation, puis <g2>forkez</g2> et <g3>clonez</g3>.")),
    );

    const result = await service.translate(
      request([
        { id: "a", markup: "Read <g1>the docs</g1>, then <g2>fork</g2> and <g3>clone</g3>." },
      ]),
    );

    expect(result.getValue()).toEqual([
      {
        id: "a",
        status: "translated",
        markup: "Lisez la documentation, puis <g2>forkez</g2> et <g3>clonez</g3>.",
        fromCache: false,
        lostGroups: 1,
      },
    ]);
  });

  test("malformed_group_tag_is_repaired_or_unwrapped", async () => {
    const { provider, service } = setup();
    provider.chat.mockResolvedValueOnce(
      Result.ok(
        "[1] Lisez <g1]la doc</g1>, <g2>la FAQ</g2> et <g3>le guide.\n[2] Puis <g>forkez</g1>.",
      ),
    );

    const result = await service.translate(
      request([
        { id: "a", markup: "Read <g1>the docs</g1>, <g2>the FAQ</g2> and <g3>the guide</g3>." },
        { id: "b", markup: "Then <g1>fork</g1>." },
      ]),
    );

    expect(result.getValue()).toEqual([
      {
        id: "a",
        status: "translated",
        markup: "Lisez <g1>la doc</g1>, <g2>la FAQ</g2> et le guide.",
        fromCache: false,
        lostGroups: 1,
      },
      { id: "b", status: "translated", markup: "fr: Then <g1>fork</g1>.", fromCache: false },
    ]);
  });

  test("dropped_footnote_atom_is_reinserted_and_the_segment_accepted_without_a_retry", async () => {
    const { provider, service, written } = setup();
    const source = "Los Angeles is the largest city.<x4/> It is in California.";
    const repaired = "Los Angeles est la plus grande ville.<x4/> Elle est en Californie.";
    provider.chat.mockResolvedValueOnce(
      Result.ok("[1] Los Angeles est la plus grande ville. Elle est en Californie.\n[2] Bonjour."),
    );

    const result = await service.translate(
      request([
        { id: "a", markup: source },
        { id: "b", markup: "Hello." },
      ]),
    );

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: repaired, fromCache: false },
      { id: "b", status: "translated", markup: "Bonjour.", fromCache: false },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(written()).toEqual(
      new Map([
        [keyOf(source), repaired],
        [keyOf("Hello."), "Bonjour."],
      ]),
    );
  });

  test("broken_group_tags_retry_each_segment_alone_once_then_fail", async () => {
    const { provider, service, batchesSent } = setup();
    const docs = "Read <g1>the docs</g1> now.";
    const guide = "See <g1>the guide</g1> later.";
    provider.chat.mockResolvedValueOnce(
      Result.ok("[1] Lisez la doc maintenant.\n[2] Bonjour.\n[3] Voir le guide plus tard."),
    );
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Lisez la doc maintenant.")));
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Voir le guide plus tard.")));

    const result = await service.translate(
      request([
        { id: "a", markup: docs },
        { id: "b", markup: "Hello." },
        { id: "c", markup: guide },
      ]),
    );

    expect(result.getValue()).toEqual([
      { id: "a", status: "failed", code: "PLACEHOLDER_LOST" },
      { id: "b", status: "translated", markup: "Bonjour.", fromCache: false },
      { id: "c", status: "failed", code: "PLACEHOLDER_LOST" },
    ]);
    expect(batchesSent().slice(1)).toEqual([seg(docs), seg(guide)]);
  });

  test("broken_group_tags_retry_success_is_accepted", async () => {
    const { provider, service, written } = setup();
    const docs = "Read <g1>the docs</g1> now.";
    provider.chat.mockResolvedValueOnce(Result.ok("[1] Lisez la doc maintenant.\n[2] Bonjour."));

    const result = await service.translate(
      request([
        { id: "a", markup: docs },
        { id: "b", markup: "Hello." },
      ]),
    );

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: `fr: ${docs}`, fromCache: false },
      { id: "b", status: "translated", markup: "Bonjour.", fromCache: false },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(written()).toEqual(
      new Map([
        [keyOf(docs), `fr: ${docs}`],
        [keyOf("Hello."), "Bonjour."],
      ]),
    );
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

  test("group_moved_out_of_parent_is_failed_STRUCTURE_MOVED_without_a_retry", async () => {
    const { provider, service } = setup();
    provider.chat.mockResolvedValue(Result.ok(seg("Voir <g1>le guide</g1> <x1/>.")));

    const result = await service.translate(
      request([{ id: "a", markup: "See <g1>the <x1/> guide</g1>." }]),
    );

    expect(result.getValue()).toEqual([{ id: "a", status: "failed", code: "STRUCTURE_MOVED" }]);
    expect(provider.chat).toHaveBeenCalledTimes(1);
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
      { kind: "text", text: "See " },
      { kind: "group", key: 1, children: [{ kind: "text", text: sentences(250) }] },
    ]);

    const result = await service.translate(request([{ id: "a", markup }]));

    expect(result.getValue()).toEqual([{ id: "a", status: "failed", code: "SEGMENT_TOO_LONG" }]);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(written().size).toBe(0);
  });

  test("missing_segment_in_response_is_retried_alone", async () => {
    const { provider, service, written, batchesSent } = setup();
    provider.chat.mockResolvedValueOnce(Result.ok("[2] Bonjour."));

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

  test("several_missing_segments_are_retried_together_in_one_call", async () => {
    const { provider, service, batchesSent } = setup();
    provider.chat.mockResolvedValueOnce(Result.ok("[2] Bonjour."));

    const result = await service.translate(
      request([
        { id: "a", markup: "Read" },
        { id: "b", markup: "Hello." },
        { id: "c", markup: "the docs" },
      ]),
    );

    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "fr: Read", fromCache: false },
      { id: "b", status: "translated", markup: "Bonjour.", fromCache: false },
      { id: "c", status: "translated", markup: "fr: the docs", fromCache: false },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(batchesSent().at(-1)).toBe("[1] Read\n[2] the docs");
  });

  test("provider_forbidden_fails_the_whole_call_and_keeps_only_validated_segments_cached", async () => {
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
    expect(written()).toEqual(new Map([[keyOf("Hello."), "Bonjour."]]));
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
    expect(batchesSent()).toHaveLength(6);

    for (const batch of batchesSent())
      expect(estimateTokens(batch)).toBeLessThanOrEqual(inputBudget);
  });

  test("segments_are_emitted_as_soon_as_the_next_numbered_line_streams_in", async () => {
    const { provider, service } = setup();
    const onOutcome = emitted();
    const seenAfterEachDelta: number[] = [];
    provider.chat.mockImplementationOnce(
      streaming(["[1] Bon", "jour.\n", "[2", "] Lancez <x1", "/> maintenant."], () =>
        seenAfterEachDelta.push(onOutcome.mock.calls.length),
      ),
    );

    const result = await service.translate(
      request([
        { id: "a", markup: "Hello." },
        { id: "b", markup: RUN },
      ]),
      { onOutcome },
    );

    expect(seenAfterEachDelta).toEqual([0, 0, 0, 1, 1]);
    expect(onOutcome.mock.calls.map(([outcome]) => outcome)).toEqual(result.getValue());
    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "Bonjour.", fromCache: false },
      { id: "b", status: "translated", markup: "Lancez <x1/> maintenant.", fromCache: false },
    ]);
  });

  test("missing_streamed_segment_is_retried_after_the_stream_and_emitted_once", async () => {
    const { provider, service, written } = setup();
    const onOutcome = emitted();
    let emittedDuringStream = 0;
    provider.chat.mockImplementationOnce(
      streaming(["[2] Bonjour.\n", "[3] Au revoir."], () => {
        emittedDuringStream = onOutcome.mock.calls.length;
      }),
    );
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Lancez <x1/> maintenant.")));

    await service.translate(
      request([
        { id: "a", markup: RUN },
        { id: "b", markup: "Hello." },
        { id: "c", markup: "Bye." },
      ]),
      { onOutcome },
    );

    expect(emittedDuringStream).toBe(1);
    expect(onOutcome.mock.calls.map(([outcome]) => outcome)).toEqual([
      { id: "b", status: "translated", markup: "Bonjour.", fromCache: false },
      { id: "c", status: "translated", markup: "Au revoir.", fromCache: false },
      { id: "a", status: "translated", markup: "Lancez <x1/> maintenant.", fromCache: false },
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(written()).toEqual(
      new Map([
        [keyOf("Hello."), "Bonjour."],
        [keyOf(RUN), "Lancez <x1/> maintenant."],
        [keyOf("Bye."), "Au revoir."],
      ]),
    );
  });

  test("streamed_segment_repeated_later_is_retried_and_its_first_version_never_cached", async () => {
    const { provider, service, written } = setup();
    const onOutcome = emitted();
    provider.chat.mockImplementationOnce(
      streaming(["[1] Bonjour.\n", "[2] Au revoir.\n", "[1] Salut."]),
    );
    provider.chat.mockResolvedValueOnce(Result.ok(seg("Bonjour à tous.")));

    const result = await service.translate(
      request([
        { id: "a", markup: "Hello." },
        { id: "b", markup: "Bye." },
      ]),
      { onOutcome },
    );

    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "Bonjour à tous.", fromCache: false },
      { id: "b", status: "translated", markup: "Au revoir.", fromCache: false },
    ]);
    expect(
      onOutcome.mock.calls.map(([outcome]) => outcome).filter((outcome) => outcome.id === "a"),
    ).toEqual([
      { id: "a", status: "translated", markup: "Bonjour.", fromCache: false },
      { id: "a", status: "translated", markup: "Bonjour à tous.", fromCache: false },
    ]);
    expect(written()).toEqual(
      new Map([
        [keyOf("Hello."), "Bonjour à tous."],
        [keyOf("Bye."), "Au revoir."],
      ]),
    );
  });

  test("same_markup_on_two_hosts_is_translated_once_per_host", async () => {
    const { provider, service } = setup();
    const segments = [{ id: "a", markup: "Sign in" }];

    await service.translate(request(segments));
    await service.translate({ ...request(segments), brief: { ...brief, host: "evil.example" } });
    await service.translate(request(segments));

    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  test("identical_markup_is_sent_once_and_fanned_out", async () => {
    const { service, batchesSent } = setup();
    const onOutcome = emitted();

    const result = await service.translate(
      request([
        { id: "a", markup: "Hello." },
        { id: "b", markup: RUN },
        { id: "c", markup: "Hello." },
      ]),
      { onOutcome },
    );

    expect(batchesSent()).toEqual([
      encodeBatch([
        { n: 1, markup: "Hello." },
        { n: 2, markup: RUN },
      ]),
    ]);
    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "fr: Hello.", fromCache: false },
      { id: "b", status: "translated", markup: `fr: ${RUN}`, fromCache: false },
      { id: "c", status: "translated", markup: "fr: Hello.", fromCache: false },
    ]);
    expect(onOutcome.mock.calls.map(([outcome]) => outcome.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("cancelled_signal_stops_before_the_next_batch_and_returns_REQUEST_CANCELLED", async () => {
    const { provider, service, written } = setup({ maxSegmentsPerBatch: 1 });
    const controller = new AbortController();
    provider.chat.mockImplementationOnce(async () => {
      controller.abort();

      return Result.ok(seg("Bonjour."));
    });

    const result = await service.translate(
      request([
        { id: "a", markup: "Hello." },
        { id: "b", markup: RUN },
      ]),
      { signal: controller.signal },
    );

    expect(result.getError()).toEqual(requestCancelled());
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(provider.chat.mock.calls[0]?.[1].signal).toBe(controller.signal);
    expect(written()).toEqual(new Map([[keyOf("Hello."), "Bonjour."]]));
  });

  test("reply_budget_follows_the_source_so_a_runaway_reply_stops_early", async () => {
    const { provider, service } = setup();
    const long = `${"Translation moves meaning between languages. ".repeat(20)}`.trim();
    provider.chat.mockImplementation(echo(french));

    await service.translate(request([{ id: "a", markup: "Hello." }]));
    await service.translate(request([{ id: "b", markup: long }]));
    const [short, wide] = provider.chat.mock.calls.map(([, options]) => options.maxOutputTokens);

    expect(short).toBeLessThan(96);
    expect(wide).toBeGreaterThan(long.length / 3);
  });

  test("empty_group_dropped_by_the_model_is_restored_cached_and_not_requested_again", async () => {
    const markup = "About forks<g2></g2>";
    const first = setup();
    first.provider.chat.mockResolvedValue(Result.ok(seg("À propos des forks")));

    const result = await first.service.translate(request([{ id: "a", markup }]));

    expect(first.batchesSent()).toEqual([seg("About forks")]);
    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: "À propos des forks<g2></g2>", fromCache: false },
    ]);

    const second = setup({ cached: first.written() });

    await second.service.translate(request([{ id: "a", markup }]));

    expect(second.provider.chat).not.toHaveBeenCalled();
  });

  test("empty_groups_return_to_their_source_position_between_kept_placeholders", async () => {
    const { service, batchesSent } = setup();
    const markup = "<g1></g1>Run <x2/><g3></g3> now <g4>here</g4>.";

    const result = await service.translate(request([{ id: "a", markup }]));

    expect(batchesSent()).toEqual([seg("Run <x2/> now <g4>here</g4>.")]);
    expect(result.getValue()).toEqual([
      {
        id: "a",
        status: "translated",
        markup: "<g1></g1>fr: Run <x2/><g3></g3> now <g4>here</g4>.",
        fromCache: false,
      },
    ]);
  });

  test("empty_group_after_text_stays_after_the_text_and_not_after_the_previous_atom", async () => {
    const { provider, service } = setup();
    provider.chat.mockResolvedValue(Result.ok(seg("À propos des forks")));

    const result = await service.translate(
      request([{ id: "a", markup: "<x1/>About forks<g2></g2>" }]),
    );

    expect(result.getValue()).toEqual([
      {
        id: "a",
        status: "translated",
        markup: "<x1/>À propos des forks<g2></g2>",
        fromCache: false,
      },
    ]);
  });

  test("empty_group_at_the_start_before_text_stays_at_the_start", async () => {
    const { provider, service } = setup();
    provider.chat.mockResolvedValue(Result.ok(seg("À propos des forks")));

    const result = await service.translate(
      request([{ id: "a", markup: "<g2></g2>About forks<x1/>" }]),
    );

    expect(result.getValue()).toEqual([
      {
        id: "a",
        status: "translated",
        markup: "<g2></g2>À propos des forks<x1/>",
        fromCache: false,
      },
    ]);
  });

  test("segment_wrapped_in_one_group_is_sent_unwrapped_and_rewrapped", async () => {
    const { service, batchesSent, written } = setup();
    const markup = "<g1><g2>Pull requests</g2></g1>";

    const result = await service.translate(request([{ id: "a", markup }]));

    expect(batchesSent()).toEqual([seg("Pull requests")]);
    expect(result.getValue()).toEqual([
      {
        id: "a",
        status: "translated",
        markup: "<g1><g2>fr: Pull requests</g2></g1>",
        fromCache: false,
      },
    ]);
    expect(written()).toEqual(new Map([[keyOf(markup), "<g1><g2>fr: Pull requests</g2></g1>"]]));
  });

  test("edge_atoms_and_wrapping_groups_are_sent_as_bare_text_and_restored", async () => {
    const { service, batchesSent, written } = setup();
    const markup = "<x1/> <g2><g3>Get <g4>started</g4> now</g3></g2> <x5/>";
    const translated = "<x1/> <g2><g3>fr: Get <g4>started</g4> now</g3></g2> <x5/>";

    const result = await service.translate(request([{ id: "a", markup }]));

    expect(batchesSent()).toEqual([seg("Get <g4>started</g4> now")]);
    expect(result.getValue()).toEqual([
      { id: "a", status: "translated", markup: translated, fromCache: false },
    ]);
    expect(written()).toEqual(new Map([[keyOf(markup), translated]]));
  });

  test("space_between_an_edge_atom_and_its_text_survives_peeling", async () => {
    const { service, batchesSent } = setup();

    const result = await service.translate(
      request([
        { id: "a", markup: "<x1/> Fork" },
        { id: "b", markup: "Star <x2/>" },
        { id: "c", markup: "<x3/> <g4> Watch </g4>" },
      ]),
    );

    expect(batchesSent()).toEqual(["[1] Fork\n[2] Star\n[3] Watch"]);
    expect(
      result.getValue().map((outcome) => outcome.status === "translated" && outcome.markup),
    ).toEqual(["<x1/> fr: Fork", "fr: Star <x2/>", "<x3/> <g4> fr: Watch </g4>"]);
  });

  test("structure_check_still_guards_the_core_left_after_edge_peeling", async () => {
    const { provider, service, written } = setup();
    provider.chat.mockResolvedValue(Result.ok(seg("Démarrez maintenant")));

    const result = await service.translate(
      request([{ id: "a", markup: "<x1/> <g2><g3>Get <g4>started</g4> now</g3></g2>" }]),
    );

    expect(result.getValue()).toEqual([{ id: "a", status: "failed", code: "PLACEHOLDER_LOST" }]);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(written().size).toBe(0);
  });
});
