import { describe, expect, mock, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { CaptionBrief } from "../domain/caption/caption-brief";
import { noCaptions } from "../domain/caption/caption-error";
import type { CaptionLine } from "../domain/caption/caption-timeline";
import type { CaptionTrack, TimedText } from "../domain/caption/caption-track";
import { VideoId } from "../domain/caption/value-objects/video-id.vo";
import { LanguageCode } from "../domain/language/value-objects/language-code.vo";
import {
  type ProviderError,
  providerError,
  requestCancelled,
} from "../domain/provider/provider-error";
import type {
  BatchRequest,
  BatchTranslateOptions,
  SegmentOutcome,
} from "./batch-translation.service";
import { CaptionTranslationService } from "./caption-translation.service";
import type { CaptionSurfaceListener } from "./ports/caption-surface";
import { InMemoryCaptionSurface } from "./testing/in-memory-caption-surface";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const videoId = (value: string): VideoId => VideoId.create(value).getValue();

const target = language("fr");

const VIDEO = videoId("dQw4w9WgXcQ");

const OTHER = videoId("9bZkp7q19f0");

const BRIEF: Omit<CaptionBrief, "generated" | "preceding"> = {
  kind: "captions",
  host: "www.youtube.com",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  channel: "Rick Astley",
  description: "The official video for Never Gonna Give You Up.",
};

const cue = (index: number, word: string): TimedText => ({
  text: `${word} ${index}.`,
  startMs: index * 5000,
  endMs: index * 5000 + 4000,
});

const manualTrack = (
  count: number,
  options: { video?: VideoId; language?: string; word?: string } = {},
): CaptionTrack => ({
  videoId: options.video ?? VIDEO,
  language: language(options.language ?? "en"),
  generated: false,
  units: Array.from({ length: count }, (_, index) => cue(index, options.word ?? "Sentence")),
});

const spokenTrack = (count: number): CaptionTrack => ({
  videoId: VIDEO,
  language: language("en"),
  generated: true,
  units: Array.from({ length: count }, (_, sentence) =>
    ["Sentence", "number", `${sentence}`, "is", "here."].map((text, word) => ({
      text,
      startMs: sentence * 5000 + word * 500,
      endMs: sentence * 5000 + word * 500 + 450,
    })),
  ).flat(),
});

type Translate = (
  request: BatchRequest,
  options?: BatchTranslateOptions,
) => Promise<Result<SegmentOutcome[], ProviderError>>;

const frenchOutcomes = (request: BatchRequest): Result<SegmentOutcome[], ProviderError> =>
  Result.ok(
    request.segments.map(
      (segment): SegmentOutcome => ({
        id: segment.id,
        status: "translated",
        markup: `fr ${segment.markup}`,
        fromCache: false,
      }),
    ),
  );

const french: Translate = async (request) => frenchOutcomes(request);

const streamed = (id: string, text: string): SegmentOutcome => ({
  id,
  status: "translated",
  markup: `fr ${text}`,
  fromCache: false,
});

const forbidden = providerError("PROVIDER_FORBIDDEN_ORIGIN", "Ollama refused the origin.");

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface ControlledCall {
  request: BatchRequest;
  options: BatchTranslateOptions;
  finish: (result: Result<SegmentOutcome[], ProviderError>) => void;
}

function controlledTranslator() {
  const calls: ControlledCall[] = [];
  const arrivals: Array<() => void> = [];
  const mode = { auto: false };

  const translate: Translate = (request, options = {}) =>
    new Promise((finish) => {
      calls.push({ request, options, finish });
      arrivals.shift()?.();

      if (mode.auto) finish(frenchOutcomes(request));
    });

  const nextCall = (): Promise<void> =>
    new Promise((resolve) => {
      arrivals.push(resolve);
    });

  const call = (index: number): ControlledCall => {
    const found = calls[index];

    if (found === undefined) throw new Error(`No call at ${index}.`);

    return found;
  };

  const autoFinish = (): void => {
    mode.auto = true;
  };

  return { translate, calls, call, nextCall, autoFinish };
}

function setup(
  options: {
    translate?: Translate;
    playhead?: number;
    sentencesPerRequest?: number;
    aheadMs?: number;
    captionWaitMs?: number;
  } = {},
) {
  const surface = new InMemoryCaptionSurface(
    Option.some(VIDEO),
    Option.some(options.playhead ?? 0),
    BRIEF,
  );
  const shown: { lines: CaptionLine[] } = { lines: [] };
  const display = {
    update: mock((lines: CaptionLine[]) => {
      shown.lines = lines;
    }),
    clear: mock(() => {
      shown.lines = [];
    }),
  };
  const translator = { translate: mock(options.translate ?? french) };
  const service = new CaptionTranslationService({
    surface,
    display,
    translator,
    capacity: { concurrency: () => Option.some(1) },
    target,
    maxConcurrency: 1,
    sentencesPerRequest: options.sentencesPerRequest ?? 3,
    aheadMs: options.aheadMs ?? 10000,
    captionWaitMs: options.captionWaitMs,
  });

  service.attach();

  const emit = (event: (listener: CaptionSurfaceListener) => void): void => {
    for (const listener of surface.listeners) event(listener);
  };

  const load = (track: CaptionTrack): void => emit((listener) => listener.onTrack(track));

  const seek = (ms: number): void => {
    surface.playhead = Option.some(ms);
    emit((listener) => listener.onPlayhead(Option.some(ms), true));
  };

  const navigate = (video: VideoId): void => {
    surface.video = Option.some(video);
    emit((listener) => listener.onNavigate(Option.some(video)));
  };

  const captionsOff = (): void => emit((listener) => listener.onCaptionsOff());

  const requests = (): BatchRequest[] =>
    translator.translate.mock.calls.map(([request]) => request);

  const sent = (): string[][] =>
    requests().map((request) => request.segments.map((segment) => segment.markup));

  const texts = (): string[] => shown.lines.map((line) => line.text);

  const flags = (): boolean[] => shown.lines.map((line) => line.translated);

  return {
    surface,
    translator,
    service,
    load,
    seek,
    navigate,
    captionsOff,
    requests,
    sent,
    texts,
    flags,
  };
}

const segmentsOf = (call: ControlledCall): string[] =>
  call.request.segments.map((segment) => segment.markup);

describe("CaptionTranslationService", () => {
  test("first_request_holds_only_the_sentence_at_the_playhead", async () => {
    const controlled = controlledTranslator();
    const { service, load } = setup({ translate: controlled.translate, playhead: 12000 });
    load(manualTrack(8));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    await flush();
    const heldAlone = controlled.calls.length;
    const second = controlled.nextCall();
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await second;

    expect(heldAlone).toBe(1);
    expect(segmentsOf(controlled.call(0))).toEqual(["Sentence 2."]);
    expect(segmentsOf(controlled.call(1))).toEqual(["Sentence 3.", "Sentence 4.", "Sentence 5."]);
  });

  test("following_requests_cover_the_window_ahead_then_the_rest_in_order", async () => {
    const { service, load, sent } = setup({ playhead: 12000, sentencesPerRequest: 2 });
    load(manualTrack(8));

    await service.toggle();
    await service.whenIdle();

    expect(sent()).toEqual([
      ["Sentence 2."],
      ["Sentence 3.", "Sentence 4."],
      ["Sentence 5.", "Sentence 6."],
      ["Sentence 7.", "Sentence 0."],
      ["Sentence 1."],
    ]);
  });

  test("translations_reach_the_display_as_they_stream", async () => {
    const controlled = controlledTranslator();
    const { service, load, texts } = setup({ translate: controlled.translate });
    load(manualTrack(3));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const second = controlled.nextCall();
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await second;
    controlled.call(1).options.onOutcome?.(streamed("1", "Sentence 1."));
    const midStream = texts();
    const midState = service.state();
    controlled.call(1).finish(frenchOutcomes(controlled.call(1).request));
    await service.whenIdle();

    expect(midStream).toEqual(["fr Sentence 0.", "fr Sentence 1.", "Sentence 2."]);
    expect(midState).toEqual({ kind: "translating" });
    expect(texts()).toEqual(["fr Sentence 0.", "fr Sentence 1.", "fr Sentence 2."]);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("pending_and_failed_sentences_show_their_original", async () => {
    const controlled = controlledTranslator();
    const { service, load, texts, flags } = setup({ translate: controlled.translate });
    load(manualTrack(3));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const pending = { texts: texts(), flags: flags() };
    const second = controlled.nextCall();
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await second;
    controlled
      .call(1)
      .finish(
        Result.ok([
          streamed("1", "Sentence 1."),
          { id: "2", status: "failed", code: "PLACEHOLDER_LOST" },
        ]),
      );
    await service.whenIdle();

    expect(pending).toEqual({
      texts: ["Sentence 0.", "Sentence 1.", "Sentence 2."],
      flags: [false, false, false],
    });
    expect(texts()).toEqual(["fr Sentence 0.", "fr Sentence 1.", "Sentence 2."]);
    expect(flags()).toEqual([true, true, false]);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("seek_forward_aborts_far_requests_and_starts_at_the_new_playhead", async () => {
    const controlled = controlledTranslator();
    const { service, load, seek, flags } = setup({
      translate: controlled.translate,
      sentencesPerRequest: 2,
    });
    load(manualTrack(20));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const lanes = Promise.all([controlled.nextCall(), controlled.nextCall()]);
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await lanes;
    seek(60000);
    const aborted = [1, 2].map((index) => controlled.call(index).options.signal?.aborted);
    controlled.autoFinish();
    controlled.call(1).finish(Result.fail(requestCancelled()));
    controlled.call(2).finish(Result.fail(requestCancelled()));
    await service.whenIdle();

    expect(segmentsOf(controlled.call(1))).toEqual(["Sentence 1.", "Sentence 2."]);
    expect(segmentsOf(controlled.call(2))).toEqual(["Sentence 3.", "Sentence 4."]);
    expect(aborted).toEqual([true, true]);
    expect(segmentsOf(controlled.call(3))).toEqual(["Sentence 12."]);
    expect(segmentsOf(controlled.call(4))).toEqual(["Sentence 13.", "Sentence 14."]);
    expect(flags()).toEqual(Array.from({ length: 20 }, () => true));
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("aborted_requests_finishing_after_a_seek_leave_the_lead_alone", async () => {
    const controlled = controlledTranslator();
    const { service, load, seek } = setup({
      translate: controlled.translate,
      sentencesPerRequest: 2,
    });
    load(manualTrack(20));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const lanes = Promise.all([controlled.nextCall(), controlled.nextCall()]);
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await lanes;
    seek(60000);
    const lead = controlled.nextCall();
    controlled.call(1).finish(Result.fail(requestCancelled()));
    await lead;
    controlled.call(2).finish(Result.fail(requestCancelled()));
    await flush();
    const whileLeading = controlled.calls.length;
    controlled.autoFinish();
    controlled.call(3).finish(frenchOutcomes(controlled.call(3).request));
    await service.whenIdle();

    expect(segmentsOf(controlled.call(3))).toEqual(["Sentence 12."]);
    expect(whileLeading).toBe(4);
    expect(segmentsOf(controlled.call(4))).toEqual(["Sentence 13.", "Sentence 14."]);
  });

  test("restarted_session_requests_never_alias_the_previous_session", async () => {
    const controlled = controlledTranslator();
    const { service, load, seek, texts, flags } = setup({
      translate: controlled.translate,
      sentencesPerRequest: 2,
    });
    load(manualTrack(20));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const lanes = Promise.all([controlled.nextCall(), controlled.nextCall()]);
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await lanes;
    await service.toggle();
    await service.toggle();
    const restartedFirst = controlled.nextCall();
    controlled.call(2).finish(Result.fail(requestCancelled()));
    await restartedFirst;
    const restartedSecond = controlled.nextCall();
    controlled.call(1).options.onOutcome?.(streamed("1", "Sentence 1."));
    controlled.call(1).finish(frenchOutcomes(controlled.call(1).request));
    await restartedSecond;
    const afterLateOutcomes = texts().slice(0, 3);
    seek(60000);
    const aborted = [3, 4].map((index) => controlled.call(index).options.signal?.aborted);
    controlled.autoFinish();
    controlled.call(3).finish(Result.fail(requestCancelled()));
    controlled.call(4).finish(Result.fail(requestCancelled()));
    await service.whenIdle();

    expect(segmentsOf(controlled.call(3))).toEqual(["Sentence 1.", "Sentence 2."]);
    expect(segmentsOf(controlled.call(4))).toEqual(["Sentence 3.", "Sentence 4."]);
    expect(afterLateOutcomes).toEqual(["fr Sentence 0.", "Sentence 1.", "Sentence 2."]);
    expect(aborted).toEqual([true, true]);
    expect(segmentsOf(controlled.call(5))).toEqual(["Sentence 12."]);
    expect(flags()).toEqual(Array.from({ length: 20 }, () => true));
  });

  test("navigation_aborts_in_flight_and_drops_late_outcomes", async () => {
    const controlled = controlledTranslator();
    const { service, load, navigate, texts } = setup({ translate: controlled.translate });
    load(manualTrack(3));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    navigate(OTHER);
    const aborted = controlled.call(0).options.signal?.aborted;
    controlled.call(0).options.onOutcome?.(streamed("0", "Sentence 0."));
    controlled.call(0).finish(Result.ok([streamed("0", "Sentence 0.")]));
    await flush();
    const afterLateOutcomes = texts();
    controlled.autoFinish();
    load(manualTrack(2, { video: OTHER, word: "Line" }));
    await service.whenIdle();

    expect(aborted).toBe(true);
    expect(afterLateOutcomes).toEqual([]);
    expect(texts()).toEqual(["fr Line 0.", "fr Line 1."]);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("navigation_with_requests_in_flight_starts_the_new_video_with_one_sentence", async () => {
    const controlled = controlledTranslator();
    const { service, load, navigate } = setup({
      translate: controlled.translate,
      sentencesPerRequest: 2,
    });
    load(manualTrack(20));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const lanes = Promise.all([controlled.nextCall(), controlled.nextCall()]);
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await lanes;
    navigate(OTHER);
    load(manualTrack(6, { video: OTHER, word: "Line" }));
    const lead = controlled.nextCall();
    controlled.call(1).finish(Result.fail(requestCancelled()));
    await lead;
    controlled.call(2).finish(Result.fail(requestCancelled()));
    await flush();

    expect(segmentsOf(controlled.call(3))).toEqual(["Line 0."]);
    expect(controlled.calls.length).toBe(4);
  });

  test("provider_failure_before_navigation_does_not_block_the_next_video", async () => {
    const controlled = controlledTranslator();
    const { service, load, navigate, texts } = setup({
      translate: controlled.translate,
      sentencesPerRequest: 2,
    });
    load(manualTrack(20));

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const lanes = Promise.all([controlled.nextCall(), controlled.nextCall()]);
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await lanes;
    controlled.call(1).finish(Result.fail(forbidden));
    await flush();
    navigate(OTHER);
    controlled.autoFinish();
    load(manualTrack(2, { video: OTHER, word: "Line" }));
    controlled.call(2).finish(Result.fail(requestCancelled()));
    await service.whenIdle();

    expect(texts()).toEqual(["fr Line 0.", "fr Line 1."]);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("activation_is_sticky_across_navigation", async () => {
    const { service, surface, load, navigate, texts } = setup();
    load(manualTrack(2));
    await service.toggle();
    await service.whenIdle();

    navigate(OTHER);
    const waiting = service.state();
    load(manualTrack(2, { video: OTHER, word: "Line" }));
    await service.whenIdle();

    expect(waiting).toEqual({ kind: "translating" });
    expect(texts()).toEqual(["fr Line 0.", "fr Line 1."]);
    expect(service.state()).toEqual({ kind: "translated" });
    expect(surface.nativeHidden).toBe(true);
  });

  test("identical_track_is_ignored", async () => {
    const controlled = controlledTranslator();
    const { service, load, texts } = setup({ translate: controlled.translate });
    load(manualTrack(3));
    const first = controlled.nextCall();
    await service.toggle();
    await first;

    load(manualTrack(3));
    await flush();

    expect(controlled.call(0).options.signal?.aborted).toBe(false);
    expect(controlled.calls.length).toBe(1);
    expect(texts()).toEqual(["Sentence 0.", "Sentence 1.", "Sentence 2."]);
  });

  test("new_language_restarts_the_session", async () => {
    const controlled = controlledTranslator();
    const { service, load, texts } = setup({ translate: controlled.translate });
    load(manualTrack(3));
    const first = controlled.nextCall();
    await service.toggle();
    await first;

    const restarted = controlled.nextCall();
    load(manualTrack(3, { language: "de", word: "Satz" }));
    await restarted;

    expect(controlled.call(0).options.signal?.aborted).toBe(true);
    expect(controlled.call(1).request.source.unwrap().value).toBe("de");
    expect(segmentsOf(controlled.call(1))).toEqual(["Satz 0."]);
    expect(texts()).toEqual(["Satz 0.", "Satz 1.", "Satz 2."]);
  });

  test("target_language_track_costs_zero_calls", async () => {
    const { service, translator, load, texts } = setup();
    load(manualTrack(2, { language: "fr-FR", word: "Phrase" }));

    await service.toggle();
    await service.whenIdle();

    expect(translator.translate).not.toHaveBeenCalled();
    expect(texts()).toEqual(["Phrase 0.", "Phrase 1."]);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("sound_pieces_show_their_original_and_are_never_sent", async () => {
    const controlled = controlledTranslator();
    const { service, load, texts, flags } = setup({ translate: controlled.translate });
    const spoken = spokenTrack(2);
    load({
      ...spoken,
      units: [
        { text: "[Music]", startMs: 0, endMs: 900 },
        ...spoken.units.map((unit) => ({
          ...unit,
          startMs: unit.startMs + 1000,
          endMs: unit.endMs + 1000,
        })),
      ],
    });

    const first = controlled.nextCall();
    await service.toggle();
    await first;
    const lead = segmentsOf(controlled.call(0));
    controlled.autoFinish();
    controlled.call(0).finish(frenchOutcomes(controlled.call(0).request));
    await service.whenIdle();

    expect(lead).toEqual(["Sentence number 0 is here."]);
    expect(controlled.calls.flatMap(segmentsOf)).not.toContain("[Music]");
    expect(texts()[0]).toBe("[Music]");
    expect(flags()).toEqual([false, true, true]);
    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("bracketed_cue_of_a_manual_track_is_never_sent", async () => {
    const { service, load, sent, texts } = setup();
    const track = manualTrack(2);
    load({
      ...track,
      units: [...track.units, { text: "[Applause]", startMs: 10000, endMs: 12000 }],
    });

    await service.toggle();
    await service.whenIdle();

    expect(sent().flat()).not.toContain("[Applause]");
    expect(texts()).toEqual(["fr Sentence 0.", "fr Sentence 1.", "[Applause]"]);
  });

  test("toggle_off_restores_native_captions_and_cc_state", async () => {
    const controlled = controlledTranslator();
    const { service, surface, load, texts } = setup({ translate: controlled.translate });
    load(manualTrack(3));
    const first = controlled.nextCall();
    await service.toggle();
    await first;

    await service.toggle();

    expect(controlled.call(0).options.signal?.aborted).toBe(true);
    expect(texts()).toEqual([]);
    expect(surface.nativeHidden).toBe(false);
    expect(surface.loads).toBe(1);
    expect(surface.restores).toBe(1);
    expect(service.state()).toEqual({ kind: "original" });
  });

  test("toggle_on_again_is_instant_and_sends_nothing", async () => {
    const { service, translator, load, texts } = setup();
    load(manualTrack(4));
    await service.toggle();
    await service.whenIdle();
    const callsBefore = translator.translate.mock.calls.length;
    await service.toggle();

    await service.toggle();
    const instant = { state: service.state(), texts: texts() };
    await service.whenIdle();

    expect(instant).toEqual({
      state: { kind: "translated" },
      texts: ["fr Sentence 0.", "fr Sentence 1.", "fr Sentence 2.", "fr Sentence 3."],
    });
    expect(translator.translate.mock.calls.length).toBe(callsBefore);
  });

  test("dispose_turns_off_restores_native_captions_and_cancels_requests", async () => {
    const controlled = controlledTranslator();
    const { service, surface, load, texts } = setup({ translate: controlled.translate });
    load(manualTrack(3));
    const first = controlled.nextCall();
    await service.toggle();
    await first;

    service.dispose();
    service.dispose();

    expect(controlled.call(0).options.signal?.aborted).toBe(true);
    expect(texts()).toEqual([]);
    expect(surface.nativeHidden).toBe(false);
    expect(surface.restores).toBe(1);
    expect(service.state()).toEqual({ kind: "original" });
  });

  test("user_turning_cc_off_turns_lambe_off", async () => {
    const { service, surface, load, captionsOff, texts } = setup();
    load(manualTrack(2));
    await service.toggle();
    await service.whenIdle();

    captionsOff();

    expect(service.state()).toEqual({ kind: "original" });
    expect(texts()).toEqual([]);
    expect(surface.nativeHidden).toBe(false);
    expect(surface.restores).toBe(0);
  });

  test("video_without_a_cc_button_reports_no_captions", async () => {
    const { service, surface, translator } = setup();
    surface.captionsAvailable = false;

    await service.toggle();

    expect(service.state()).toEqual({ kind: "error", error: noCaptions() });
    expect(surface.nativeHidden).toBe(false);
    expect(translator.translate).not.toHaveBeenCalled();
  });

  test("no_track_within_the_wait_reports_no_captions_until_one_arrives", async () => {
    const { service, surface, load, texts } = setup({ captionWaitMs: 5 });

    await service.toggle();
    const waiting = service.state();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const gaveUp = { state: service.state(), nativeHidden: surface.nativeHidden };
    load(manualTrack(2));
    await service.whenIdle();

    expect(waiting).toEqual({ kind: "translating" });
    expect(gaveUp).toEqual({ state: { kind: "error", error: noCaptions() }, nativeHidden: false });
    expect(noCaptions().message).toBe("This video has no captions to translate.");
    expect(texts()).toEqual(["fr Sentence 0.", "fr Sentence 1."]);
    expect(service.state()).toEqual({ kind: "translated" });
    expect(surface.nativeHidden).toBe(true);
  });

  test("track_arriving_in_time_cancels_the_wait", async () => {
    const { service, load } = setup({ captionWaitMs: 5 });

    await service.toggle();
    load(manualTrack(2));
    await service.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(service.state()).toEqual({ kind: "translated" });
  });

  test("provider_error_sets_error_state_and_keeps_originals", async () => {
    const { service, surface, load, texts } = setup({
      translate: async () => Result.fail(forbidden),
    });
    load(manualTrack(3));

    await service.toggle();
    await service.whenIdle();

    expect(service.state()).toEqual({ kind: "error", error: forbidden });
    expect(texts()).toEqual(["Sentence 0.", "Sentence 1.", "Sentence 2."]);
    expect(surface.nativeHidden).toBe(true);
  });

  test("request_brief_carries_generated_flag_and_two_preceding_sentences", async () => {
    const { service, load, requests, sent } = setup({ playhead: 15000, sentencesPerRequest: 2 });
    load(spokenTrack(6));

    await service.toggle();
    await service.whenIdle();
    const sentence = (index: number): string => `Sentence number ${index} is here.`;

    expect(sent()).toEqual([
      [sentence(3)],
      [sentence(4), sentence(5)],
      [sentence(0), sentence(1)],
      [sentence(2)],
    ]);
    expect(requests().map((request) => request.brief)).toEqual([
      { ...BRIEF, generated: true, preceding: [sentence(1), sentence(2)] },
      { ...BRIEF, generated: true, preceding: [sentence(2), sentence(3)] },
      { ...BRIEF, generated: true, preceding: [] },
      { ...BRIEF, generated: true, preceding: [sentence(0), sentence(1)] },
    ]);
    expect(requests()[0]?.source.unwrap().value).toBe("en");
    expect(requests().every((request) => request.cachePolicy === "use")).toBe(true);
  });
});
