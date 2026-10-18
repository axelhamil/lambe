import { describe, expect, mock, spyOn, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { Block } from "../domain/block/block";
import type { InlineNode } from "../domain/block/inline-node";
import { BlockId } from "../domain/block/value-objects/block-id.vo";
import { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import type { PageBrief } from "../domain/page/page-brief";
import {
  type ProviderError,
  providerError,
  requestCancelled,
} from "../domain/provider/provider-error";
import type { ProximityRank } from "../domain/queue/translation-queue";
import type {
  BatchRequest,
  BatchTranslateOptions,
  SegmentOutcome,
} from "./batch-translation.service";
import { PageTranslationService } from "./page-translation.service";
import { InMemoryPageSurface } from "./testing/in-memory-page-surface";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const target = language("fr");

const brief: PageBrief = {
  host: "github.com",
  title: "About forks",
  description: "A fork is a new repository that shares code with an upstream repository.",
  headings: ["About forks"],
  sourceLanguage: Option.some(language("en")),
};

const blockId = (value: string): BlockId => BlockId.create(value).getValue();

const block = (id: string, ...nodes: InlineNode[]): Block => ({ id: blockId(id), nodes });

const text = (value: string): InlineNode => ({ kind: "text", text: value });

const group = (key: number, ...children: InlineNode[]): InlineNode => ({
  kind: "group",
  key,
  children,
});

const paragraph = (id: string, sentence: string): Block => block(id, text(sentence));

type Translate = (
  request: BatchRequest,
  options?: BatchTranslateOptions,
) => Promise<Result<SegmentOutcome[], ProviderError>>;

const translatedWith =
  (render: (markup: string, request: BatchRequest) => string | undefined): Translate =>
  async (request) =>
    Result.ok(
      request.segments.map((segment): SegmentOutcome => {
        const markup = render(segment.markup, request);

        if (markup === undefined)
          return { id: segment.id, status: "failed", code: "PLACEHOLDER_LOST" };

        return { id: segment.id, status: "translated", markup, fromCache: false };
      }),
    );

const french = translatedWith((markup, request) =>
  request.cachePolicy === "refresh" ? `fresh ${markup}` : `fr ${markup}`,
);

const forbidden = providerError("PROVIDER_FORBIDDEN_ORIGIN", "Ollama refused the origin.");

function setup(
  options: {
    blocks?: Block[];
    brief?: PageBrief;
    translate?: Translate;
    detect?: (text: string) => Option<LanguageCode>;
    maxSegmentsPerRequest?: number;
    firstRequestSegments?: number;
    concurrency?: () => number;
  } = {},
) {
  const surface = new InMemoryPageSurface(options.brief ?? brief, options.blocks ?? []);
  const translator = { translate: mock(options.translate ?? french) };
  const detect = options.detect ?? (() => Option.none<LanguageCode>());
  const detector = { detect: mock(async (input: string) => detect(input)) };
  const capacity = { concurrency: options.concurrency ?? (() => 1) };
  const service = new PageTranslationService({
    surface,
    translator,
    capacity,
    detector,
    target,
    maxSegmentsPerRequest: options.maxSegmentsPerRequest ?? 8,
    firstRequestSegments: options.firstRequestSegments ?? 8,
  });

  const near = (id: string, rank: ProximityRank): void => {
    for (const listener of surface.listeners) listener.onProximity(blockId(id), Option.some(rank));
  };

  const far = (id: string): void => {
    for (const listener of surface.listeners) listener.onProximity(blockId(id), Option.none());
  };

  const discover = (...blocks: Block[]): void => {
    for (const listener of surface.listeners) listener.onBlocks(blocks);
  };

  const requests = (): BatchRequest[] =>
    translator.translate.mock.calls.map(([request]) => request);

  const sentMarkup = (): string[][] =>
    requests().map((request) => request.segments.map((segment) => segment.markup));

  const committed = (id: string) => surface.translations.get(id);

  return {
    surface,
    translator,
    detector,
    service,
    near,
    far,
    discover,
    requests,
    sentMarkup,
    committed,
  };
}

function heldTranslator() {
  const releases: Array<() => void> = [];
  const arrivals: Array<() => void> = [];

  const translate: Translate = (request) =>
    new Promise((resolve) => {
      releases.push(() => resolve(french(request)));
      arrivals.shift()?.();
    });

  const nextRequest = (): Promise<void> =>
    new Promise((resolve) => {
      arrivals.push(resolve);
    });

  const releaseNext = (): void => {
    releases.shift()?.();
  };

  return { translate, nextRequest, releaseNext };
}

interface ControlledCall {
  request: BatchRequest;
  options: BatchTranslateOptions;
  finish: (result: Result<SegmentOutcome[], ProviderError>) => void;
}

function controlledTranslator() {
  const calls: ControlledCall[] = [];
  const arrivals: Array<() => void> = [];

  const translate: Translate = (request, options = {}) =>
    new Promise((finish) => {
      calls.push({ request, options, finish });
      arrivals.shift()?.();
    });

  const nextCall = (): Promise<void> =>
    new Promise((resolve) => {
      arrivals.push(resolve);
    });

  return { translate, calls, nextCall };
}

const streamedFrench = (id: string, markup: string): SegmentOutcome => ({
  id,
  status: "translated",
  markup: `fr ${markup}`,
  fromCache: false,
});

const ALPHA = paragraph("alpha", "Forks share code with upstream.");

const BETA = paragraph("beta", "A fork keeps its own history.");

const GAMMA = paragraph("gamma", "Pull requests flow back upstream.");

const DELTA = paragraph("delta", "Deleting a fork is permanent.");

const LONG_SENTENCE =
  "Forks share code with upstream, keep their own history and send pull requests back upstream.";

const LONG = paragraph("long", LONG_SENTENCE);

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const sentBlocks = (calls: ControlledCall[]): string[][] =>
  calls.map((call) => call.request.segments.map((segment) => segment.markup));

const LINKED = block("linked", text("Read "), group(1, text("the docs")), text(" before forking."));

describe("PageTranslationService", () => {
  test("first_toggle_translates_visible_blocks_before_next_screen_blocks", async () => {
    const { service, near, sentMarkup, committed } = setup({
      blocks: [ALPHA, BETA, GAMMA],
      maxSegmentsPerRequest: 2,
    });

    await service.toggle();
    near("alpha", 1);
    near("beta", 1);
    near("gamma", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([
      ["Pull requests flow back upstream."],
      ["Forks share code with upstream.", "A fork keeps its own history."],
    ]);
    expect(committed("gamma")).toEqual({
      blockId: GAMMA.id,
      kind: "structured",
      nodes: [text("fr Pull requests flow back upstream.")],
    });
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("far_blocks_dropped_from_the_queue_are_never_sent", async () => {
    const { service, near, far, sentMarkup, committed } = setup({ blocks: [ALPHA, BETA] });

    await service.toggle();
    near("alpha", 0);
    near("beta", 1);
    far("beta");
    await service.whenIdle();

    expect(sentMarkup()).toEqual([["Forks share code with upstream."]]);
    expect(committed("beta")).toBeUndefined();
  });

  test("second_toggle_shows_original_without_calling_the_translator", async () => {
    const { service, surface, translator, near } = setup({ blocks: [ALPHA] });
    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();
    surface.show("translated");

    await service.toggle();
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "original" });
    expect(surface.view).toBe("original");
    expect(translator.translate).toHaveBeenCalledTimes(1);
  });

  test("third_toggle_shows_translated_without_calling_the_translator", async () => {
    const { service, surface, translator, near } = setup({ blocks: [ALPHA] });
    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();
    await service.toggle();

    await service.toggle();
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "translated" });
    expect(surface.view).toBe("translated");
    expect(translator.translate).toHaveBeenCalledTimes(1);
  });

  test("page_already_in_target_language_makes_zero_translator_calls_and_ends_translated", async () => {
    const { service, translator, near } = setup({
      blocks: [
        paragraph("un", "Un fork partage le code avec le dépôt amont."),
        paragraph("deux", "Supprimer un fork est définitif."),
      ],
      detect: () => Option.some(language("fr-FR")),
    });

    await service.toggle();
    near("un", 0);
    near("deux", 1);
    await service.whenIdle();

    expect(translator.translate).not.toHaveBeenCalled();
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("mixed_page_sends_only_non_target_blocks", async () => {
    const { service, near, sentMarkup, committed } = setup({
      blocks: [ALPHA, paragraph("deux", "Supprimer un fork est définitif.")],
      detect: (input) => Option.some(language(input.startsWith("Supprimer") ? "fr" : "en")),
    });

    await service.toggle();
    near("alpha", 0);
    near("deux", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([["Forks share code with upstream."]]);
    expect(committed("deux")).toBeUndefined();
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("short_block_in_target_language_is_still_sent", async () => {
    const { service, near, sentMarkup } = setup({
      blocks: [paragraph("oui", "Oui.")],
      detect: () => Option.some(language("fr")),
    });

    await service.toggle();
    near("oui", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([["Oui."]]);
  });

  test("failed_structured_segment_falls_back_to_text_slots", async () => {
    const { service, near, sentMarkup, committed } = setup({
      blocks: [LINKED],
      translate: translatedWith((markup) => (markup.includes("<") ? undefined : `fr ${markup}`)),
    });

    await service.toggle();
    near("linked", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([
      ["Read <g1>the docs</g1> before forking."],
      ["Read", "the docs", "before forking."],
    ]);
    expect(committed("linked")).toEqual({
      blockId: LINKED.id,
      kind: "text-slots",
      texts: ["fr Read ", "fr the docs", " fr before forking."],
    });
  });

  test("failed_text_slots_leave_the_block_original_and_state_translated", async () => {
    const { service, near, requests, committed } = setup({
      blocks: [LINKED],
      translate: translatedWith(() => undefined),
    });

    await service.toggle();
    near("linked", 0);
    await service.whenIdle();
    near("linked", 0);
    await service.whenIdle();

    expect(requests()).toHaveLength(2);
    expect(committed("linked")).toBeUndefined();
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("blocks_discovered_after_translation_are_translated_without_a_new_toggle", async () => {
    const { service, near, discover, committed } = setup({ blocks: [ALPHA] });
    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();

    discover(BETA);
    near("beta", 0);
    await service.whenIdle();

    expect(committed("beta")).toEqual({
      blockId: BETA.id,
      kind: "structured",
      nodes: [text("fr A fork keeps its own history.")],
    });
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("retranslate_sends_refresh_policy_and_resends_all_ranked_blocks", async () => {
    const { service, near, far, requests, committed } = setup({ blocks: [ALPHA, BETA, GAMMA] });
    await service.toggle();
    near("alpha", 0);
    near("beta", 1);
    near("gamma", 1);
    await service.whenIdle();
    far("gamma");

    await service.retranslate();
    await service.whenIdle();

    const refreshed = requests().filter((request) => request.cachePolicy === "refresh");
    expect(refreshed.map((request) => request.segments.map((segment) => segment.markup))).toEqual([
      ["Forks share code with upstream."],
      ["A fork keeps its own history."],
    ]);
    expect(committed("alpha")).toEqual({
      blockId: ALPHA.id,
      kind: "structured",
      nodes: [text("fresh Forks share code with upstream.")],
    });
    expect(committed("gamma")).toEqual({
      blockId: GAMMA.id,
      kind: "structured",
      nodes: [text("fr Pull requests flow back upstream.")],
    });
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("provider_forbidden_sets_error_state_with_the_error_and_stops_pumping", async () => {
    const { service, near, translator, surface } = setup({
      blocks: [ALPHA, BETA, GAMMA],
      translate: async () => Result.fail(forbidden),
      maxSegmentsPerRequest: 1,
    });

    await service.toggle();
    near("alpha", 0);
    near("beta", 0);
    near("gamma", 0);
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "error", error: forbidden });
    expect(translator.translate).toHaveBeenCalledTimes(2);
    expect(surface.translations.size).toBe(0);
  });

  test("toggle_from_error_retries", async () => {
    const { service, near, translator, committed } = setup({ blocks: [ALPHA, BETA] });
    translator.translate.mockImplementationOnce(async () => Result.fail(forbidden));
    await service.toggle();
    near("alpha", 0);
    near("beta", 0);
    await service.whenIdle();

    await service.toggle();
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "translated" });
    expect(committed("alpha")).toBeDefined();
    expect(committed("beta")).toBeDefined();
  });

  test("request_never_exceeds_maxSegmentsPerRequest", async () => {
    const wide = block(
      "wide",
      group(1, text("Fork")),
      text(" or "),
      group(2, text("clone")),
      text(" the repository."),
    );
    const { service, near, sentMarkup, committed } = setup({
      blocks: [ALPHA, BETA, GAMMA, DELTA, wide],
      translate: translatedWith((markup) => (markup.includes("<") ? undefined : `fr ${markup}`)),
      maxSegmentsPerRequest: 2,
    });

    await service.toggle();
    for (const id of ["alpha", "beta", "gamma", "delta", "wide"]) near(id, 0);
    await service.whenIdle();

    const sizes = sentMarkup().map((segments) => segments.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2);
    expect(sentMarkup().flat()).toHaveLength(9);
    expect(committed("wide")).toEqual({
      blockId: wide.id,
      kind: "text-slots",
      texts: ["fr Fork", " fr or ", "fr clone", " fr the repository."],
    });
  });

  test("rejected_translator_sets_unreachable_error_and_toggle_recovers", async () => {
    const { service, near, translator, committed } = setup({ blocks: [ALPHA] });
    translator.translate.mockImplementationOnce(async () => {
      throw new Error("Extension context invalidated.");
    });
    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();
    const failed = service.state();

    await service.toggle();
    await service.whenIdle();

    expect(failed).toEqual({
      kind: "error",
      error: {
        code: "PROVIDER_UNREACHABLE",
        message: expect.stringContaining("Extension context invalidated."),
      },
    });
    expect(committed("alpha")).toBeDefined();
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("rejected_detector_sets_unreachable_error", async () => {
    const { service, near, translator } = setup({
      blocks: [ALPHA],
      detect: () => {
        throw new Error("Detector unavailable.");
      },
    });

    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();

    expect(service.state()).toEqual({
      kind: "error",
      error: { code: "PROVIDER_UNREACHABLE", message: expect.stringContaining("Detector") },
    });
    expect(translator.translate).not.toHaveBeenCalled();
  });

  test("empty_page_ends_translated_without_translator_calls", async () => {
    const { service, translator } = setup({ blocks: [] });

    await service.toggle();
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "translated" });
    expect(translator.translate).not.toHaveBeenCalled();
  });

  test("page_whose_blocks_are_all_far_ends_translated_without_translator_calls", async () => {
    const { service, far, translator } = setup({ blocks: [ALPHA, BETA] });

    await service.toggle();
    far("alpha");
    far("beta");
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "translated" });
    expect(translator.translate).not.toHaveBeenCalled();
  });

  test("page_stays_translating_until_every_block_has_a_proximity_report", async () => {
    const { service, near } = setup({ blocks: [ALPHA, BETA] });

    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "translating" });
  });

  test("toggle_to_original_during_a_request_commits_nothing", async () => {
    const held = heldTranslator();
    const { service, surface, near } = setup({ blocks: [ALPHA], translate: held.translate });
    await service.toggle();
    const requested = held.nextRequest();
    near("alpha", 0);
    await requested;

    await service.toggle();
    held.releaseNext();
    await service.whenIdle();

    expect(surface.translations.size).toBe(0);
    expect(surface.view).toBe("original");
    expect(service.state()).toEqual({ kind: "original" });
  });

  test("retranslate_during_a_request_discards_the_stale_response", async () => {
    const held = heldTranslator();
    const { service, near, requests, committed } = setup({
      blocks: [ALPHA],
      translate: held.translate,
    });
    await service.toggle();
    const stale = held.nextRequest();
    near("alpha", 0);
    await stale;

    const fresh = held.nextRequest();
    await service.retranslate();
    held.releaseNext();
    await fresh;
    held.releaseNext();
    await service.whenIdle();

    expect(requests().map((request) => request.cachePolicy)).toEqual(["use", "refresh"]);
    expect(committed("alpha")).toEqual({
      blockId: ALPHA.id,
      kind: "structured",
      nodes: [text("fresh Forks share code with upstream.")],
    });
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("toggle_to_original_then_immediate_retranslate_ends_translated", async () => {
    const { service, near, committed } = setup({ blocks: [ALPHA] });
    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();

    const toggled = service.toggle();
    const retranslated = service.retranslate();
    await Promise.all([toggled, retranslated]);
    await service.whenIdle();

    expect(committed("alpha")).toEqual({
      blockId: ALPHA.id,
      kind: "structured",
      nodes: [text("fresh Forks share code with upstream.")],
    });
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("first_toggle_then_immediate_retranslate_ends_translated_with_refresh", async () => {
    const { service, near, requests, committed } = setup({ blocks: [ALPHA] });

    const toggled = service.toggle();
    const retranslated = service.retranslate();
    await Promise.all([toggled, retranslated]);
    near("alpha", 0);
    await service.whenIdle();

    expect(requests().map((request) => request.cachePolicy)).toEqual(["refresh"]);
    expect(committed("alpha")).toEqual({
      blockId: ALPHA.id,
      kind: "structured",
      nodes: [text("fresh Forks share code with upstream.")],
    });
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("toggle_then_retranslate_during_a_request_discards_the_stale_response", async () => {
    const held = heldTranslator();
    const { service, surface, near, requests, committed } = setup({
      blocks: [ALPHA],
      translate: held.translate,
    });
    await service.toggle();
    const stale = held.nextRequest();
    near("alpha", 0);
    await stale;

    const fresh = held.nextRequest();
    await service.toggle();
    await service.retranslate();
    held.releaseNext();
    await fresh;
    held.releaseNext();
    await service.whenIdle();

    expect(requests().map((request) => request.cachePolicy)).toEqual(["use", "refresh"]);
    expect(committed("alpha")).toEqual({
      blockId: ALPHA.id,
      kind: "structured",
      nodes: [text("fresh Forks share code with upstream.")],
    });
    expect(surface.translations.size).toBe(1);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("detached_block_rediscovered_is_translated_again", async () => {
    const { service, surface, near, discover, sentMarkup, committed } = setup({ blocks: [ALPHA] });
    spyOn(surface, "commit").mockImplementationOnce(() => Result.fail({ code: "BLOCK_DETACHED" }));
    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();

    discover(ALPHA);
    near("alpha", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([
      ["Forks share code with upstream."],
      ["Forks share code with upstream."],
    ]);
    expect(committed("alpha")).toEqual({
      blockId: ALPHA.id,
      kind: "structured",
      nodes: [text("fr Forks share code with upstream.")],
    });
  });

  test("zero_max_segments_still_sends_one_block_per_request_and_ends", async () => {
    const { service, near, sentMarkup } = setup({
      blocks: [ALPHA, BETA],
      maxSegmentsPerRequest: 0,
    });

    await service.toggle();
    near("alpha", 0);
    near("beta", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([
      ["Forks share code with upstream."],
      ["A fork keeps its own history."],
    ]);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("page_detector_throwing_synchronously_sets_unreachable_error", async () => {
    const { service, detector } = setup({
      blocks: [ALPHA],
      brief: { ...brief, sourceLanguage: Option.none() },
    });
    detector.detect.mockImplementationOnce(() => {
      throw new Error("Detector crashed.");
    });

    await service.toggle();
    await service.whenIdle();

    expect(service.state()).toEqual({
      kind: "error",
      error: {
        code: "PROVIDER_UNREACHABLE",
        message: expect.stringContaining("Detector crashed."),
      },
    });
  });

  test("first_request_holds_at_most_firstRequestSegments_rank_zero_blocks", async () => {
    const { service, near, sentMarkup } = setup({
      blocks: [ALPHA, BETA, GAMMA, DELTA],
      firstRequestSegments: 2,
    });

    await service.toggle();
    near("delta", 1);
    near("alpha", 0);
    near("beta", 0);
    near("gamma", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([
      ["Forks share code with upstream.", "A fork keeps its own history."],
      ["Pull requests flow back upstream.", "Deleting a fork is permanent."],
    ]);
  });

  test("streamed_outcome_is_committed_before_the_request_ends_and_not_twice", async () => {
    const control = controlledTranslator();
    const { service, surface, near, committed } = setup({
      blocks: [ALPHA, BETA],
      translate: control.translate,
    });
    const commit = spyOn(surface, "commit");
    await service.toggle();
    const arrived = control.nextCall();
    near("alpha", 0);
    near("beta", 0);
    await arrived;
    const [call] = control.calls;
    const alpha = streamedFrench("0", "Forks share code with upstream.");
    const beta = streamedFrench("1", "A fork keeps its own history.");

    call?.options.onOutcome?.(alpha);
    const streamed = committed("alpha");
    call?.finish(Result.ok([alpha, beta]));
    await service.whenIdle();

    expect(streamed).toEqual({
      blockId: ALPHA.id,
      kind: "structured",
      nodes: [text("fr Forks share code with upstream.")],
    });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(committed("beta")).toBeDefined();
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("cancelled_request_does_not_set_error_state_and_commits_nothing_after_cancel", async () => {
    const control = controlledTranslator();
    const { service, near, committed } = setup({
      blocks: [ALPHA, BETA],
      translate: control.translate,
    });
    await service.toggle();
    const arrived = control.nextCall();
    near("alpha", 0);
    near("beta", 0);
    await arrived;
    const [call] = control.calls;

    call?.options.onOutcome?.(streamedFrench("0", "Forks share code with upstream."));
    await service.toggle();
    call?.options.onOutcome?.(streamedFrench("1", "A fork keeps its own history."));
    call?.finish(Result.fail(requestCancelled()));
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "original" });
    expect(committed("alpha")).toBeDefined();
    expect(committed("beta")).toBeUndefined();
  });

  test("cancelled_request_without_a_toggle_requeues_its_blocks_instead_of_failing", async () => {
    const { service, near, translator, committed } = setup({ blocks: [ALPHA] });
    translator.translate.mockImplementationOnce(async () => Result.fail(requestCancelled()));

    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();

    expect(translator.translate).toHaveBeenCalledTimes(2);
    expect(committed("alpha")).toBeDefined();
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("worker_that_disconnects_on_every_request_ends_in_unreachable_error_after_one_retry", async () => {
    const { service, near, translator, committed } = setup({ blocks: [ALPHA] });
    translator.translate.mockImplementation(async () => Result.fail(requestCancelled()));

    await service.toggle();
    near("alpha", 0);
    await service.whenIdle();

    expect(translator.translate).toHaveBeenCalledTimes(2);
    expect(committed("alpha")).toBeUndefined();
    expect(service.state()).toMatchObject({
      kind: "error",
      error: { code: "PROVIDER_UNREACHABLE" },
    });
  });

  test("one_disconnect_cancelling_two_pipelined_requests_is_retried_once", async () => {
    const { service, near, translator, committed } = setup({
      blocks: [ALPHA, BETA],
      maxSegmentsPerRequest: 1,
      firstRequestSegments: 1,
    });
    translator.translate
      .mockImplementationOnce(async () => Result.fail(requestCancelled()))
      .mockImplementationOnce(async () => Result.fail(requestCancelled()));

    await service.toggle();
    near("alpha", 0);
    near("beta", 0);
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "translated" });
    expect(committed("alpha")).toBeDefined();
    expect(committed("beta")).toBeDefined();
  });

  test("toggle_to_original_aborts_the_in_flight_request", async () => {
    const control = controlledTranslator();
    const { service, near } = setup({ blocks: [ALPHA], translate: control.translate });
    await service.toggle();
    const arrived = control.nextCall();
    near("alpha", 0);
    await arrived;
    const signal = control.calls[0]?.options.signal;
    const abortedBefore = signal?.aborted;

    await service.toggle();

    expect(abortedBefore).toBe(false);
    expect(signal?.aborted).toBe(true);
  });

  test("pipeline_keeps_one_request_ahead_while_streaming", async () => {
    const control = controlledTranslator();
    const { service, near } = setup({
      blocks: [ALPHA, BETA, GAMMA, DELTA],
      translate: control.translate,
      maxSegmentsPerRequest: 1,
      firstRequestSegments: 1,
    });
    await service.toggle();

    for (const id of ["alpha", "beta", "gamma", "delta"]) near(id, 0);

    await flush();
    const [first] = control.calls;
    first?.options.onOutcome?.(streamedFrench("0", "Forks share code with upstream."));
    await flush();
    const whileStreaming = sentBlocks(control.calls);
    first?.finish(Result.ok([streamedFrench("0", "Forks share code with upstream.")]));
    await flush();

    expect(whileStreaming).toEqual([
      ["Forks share code with upstream."],
      ["A fork keeps its own history."],
    ]);
    expect(sentBlocks(control.calls)).toEqual([
      ["Forks share code with upstream."],
      ["A fork keeps its own history."],
      ["Pull requests flow back upstream."],
    ]);
  });

  test("rank_zero_requests_follow_document_order", async () => {
    const { service, near, sentMarkup } = setup({ blocks: [ALPHA, BETA, GAMMA, DELTA] });

    await service.toggle();
    near("delta", 0);
    near("gamma", 0);
    near("alpha", 0);
    near("beta", 0);
    await service.whenIdle();

    expect(sentMarkup()).toEqual([
      [
        "Forks share code with upstream.",
        "A fork keeps its own history.",
        "Pull requests flow back upstream.",
        "Deleting a fork is permanent.",
      ],
    ]);
  });

  test("rank_zero_is_split_into_balanced_requests_across_slots", async () => {
    const { service, near, sentMarkup } = setup({
      blocks: [ALPHA, LONG, BETA, GAMMA, DELTA],
      firstRequestSegments: 1,
      concurrency: () => 2,
    });

    await service.toggle();

    for (const id of ["alpha", "long", "beta", "gamma", "delta"]) near(id, 0);

    await service.whenIdle();

    expect(sentMarkup()).toEqual([
      ["Forks share code with upstream."],
      [LONG_SENTENCE],
      [
        "A fork keeps its own history.",
        "Pull requests flow back upstream.",
        "Deleting a fork is permanent.",
      ],
    ]);
  });
});
