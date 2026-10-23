# Lambë Plan 3: YouTube With Existing Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a YouTube watch page, a lambë button next to CC replaces the native captions with Lambë's own overlay showing the captions translated into the default language, sentence by sentence, ahead of the playhead, and a second click brings the native captions back.

**Architecture:** A main world script observes the player's own `/api/timedtext` json3 responses (read only) and relays them to an isolated YouTube content script through validated DOM events. The translation package gains a `caption` domain (track, sentence, brief, re-segmentation, timeline ranking), a `CaptionTranslationService` that schedules sentences from the playhead through the existing `TranslationQueue` and a `RequestPump` extracted from `PageTranslationService`, and a YouTube infrastructure adapter for the player. Requests travel through the existing `PortBatchTranslator` and `lambe/translate` port to the unchanged background `BatchTranslationService`, so batching, budget, validation, retry, cache, provider and adaptive concurrency are reused as they are.

**Tech Stack:** unchanged from Plan 1 (TypeScript 7.0.2, Bun 1.4.3, WXT 0.21.4, Zod 4.6.7, happy-dom 21.0.3, Biome 2.5.15, knip 6.41.0, jscpd 5.4.1, dependency-cruiser 18.6.0). No new dependency. `yt-dlp` only to save fixtures.

**Spec:** `docs/superpowers/specs/2026-10-18-lambe-design.md` sections 6.3, 9.1, 9.2, 13, 14 and 4. Roadmap: `docs/superpowers/plans/2026-10-18-roadmap.md`. Conventions and engine as built: `docs/superpowers/plans/2026-10-18-plan-1-page-translation.md` and the merged code. Mechanism study (never copy code): Immersive Translate report, summarized in the Decisions below.

## Decisions

Builder calls the spec leaves open (section 14 and silences). Central, long lived code gets the state of the art; the rest gets the simple option.

1. **Where captions live.** Options: inside `packages/translation` (`domain/caption`, `application/caption-translation.service.ts`, `infrastructure/youtube`) or a new `packages/captions`. Choice: inside translation. Why: the roadmap puts the caption segment shape there, the service is a sibling of `PageTranslationService` over the same ports, and Plan 4 feeds the same pipeline. Switch: move the three folders to `packages/captions` with its own `exports` once a second video site arrives.
2. **Scheduling loop.** Options: a second lanes loop in the caption service, or extracting the lanes, concurrency, abort controllers, epoch and transport retry of `PageTranslationService.drain/process` into a shared `RequestPump`. Choice: extract (central and long lived, and a copy would trip jscpd and drift). Why: one implementation of concurrency `capacity + REQUESTS_AHEAD`, cancellation and the worker disconnect rule. Switch: inline the pump back into each service.
3. **Queue.** Options: a new time ordered queue, or the existing `TranslationQueue` unchanged. Choice: reuse it: sentence ids are `BlockId` values `<videoId>:<index>`, role `content`, rank 0 for sentences overlapping `[playhead, playhead + 60 s]`, rank 1 for every other sentence, position = circular distance from the current sentence, so the whole track is covered in order from the current time (spec 9.2) and a seek is only a re-rank. Switch: generalize the queue id type to a `SegmentId` if a third consumer appears.
4. **Capture.** Options: `chrome.webRequest` (no response bodies in MV3), re-fetching the track URL (needs a PoToken, spec 9.1), or patching `XMLHttpRequest` and `fetch` read only in a `world: "MAIN"` content script at `document_start`. Choice: the patch. Switch: replace `installTimedtextHook`; the rest only sees `TimedtextCapture`.
5. **Main world channel.** Options: `window.postMessage`, a CustomEvent with a random name, or a CustomEvent with fixed `lambe:` names. Choice: fixed names on `document`, `detail` as a JSON string, Zod validation and a size cap on the isolated side, a relay that buffers the last 3 captures and replays them on a `lambe:timedtext-ready` handshake. Why: the page shares the main world, so no name can be secret from it; validation is the real guard, `postMessage` also reaches frames, and the handshake removes the start order race. Switch: swap `timedtext-channel.ts`.
6. **Caption prompt context.** Options: reuse `PageBrief` fields as is, or a `CaptionBrief` in a `ContentBrief = PageBrief | CaptionBrief` union discriminated by `kind`. Choice: the union, with a caption branch in both prompt adapters and `promptVersionOf(brief)` returning `PROMPT_VERSION` for pages and `CAPTION_PROMPT_VERSION` (`"c1"`) for captions. Why: captions need their own instructions (spoken register, one line per sentence, speech recognition noise) and their own cache keys, while existing page cache entries keep their keys. Switch: fold the version into one constant and bump it.
7. **Neighbour window (spec 9.2).** Options: whole transcript summary (does not fit TranslateGemma's 2048 tokens), or consecutive sentences per request plus a short look back. Choice: requests of 6 consecutive sentences (batches of 8 in the worker) and `CaptionBrief.preceding`, the up to 2 source sentences just before the request. Switch: change `captionSentencesPerRequest` and `PRECEDING_SENTENCES`.
8. **Manual tracks.** Options: one sentence per cue, or the same re-segmentation as auto tracks. Choice: one sentence per cue, line breaks joined by a space, author timing kept. Why: spec 9.2 only asks re-segmentation for auto captions and manual cue timing is deliberate. Switch: route manual tracks through the punctuation mode of `segmentSentences`.
9. **Auto caption re-segmentation.** Options: an LLM pass (TranslateGemma cannot restore punctuation) or deterministic rules. Choice: deterministic pure rules with per language word lists (`en`, `fr`, empty base), one test per rule. Switch: a new strategy behind `segmentSentences`.
10. **Display.** Translated only, replacing the native rendering (spec 6.3 and non goal "bilingual display"). A sentence whose translation is pending or failed shows its original text, never a blank. Switch: `CaptionLine` already carries the original, so a bilingual mode is a view change.
11. **Overlay.** Options: `timeupdate` sync (4 Hz, up to 250 ms late) and JS font sizing, or a shadow root mounted inside `#movie_player` (fullscreen and theater for free), `requestAnimationFrame` sync while playing plus `seeked` and `pause`, font size by container query units (`max(14px, min(2.2cqw, 4.2cqh))`), lifted above the controls when the player lacks `ytp-autohide`, hidden while the player has `ad-showing`. Choice: the latter. Switch: none needed.
12. **Session rules.** Activation is sticky across SPA navigation (`yt-navigate-finish`), like CC. Lambë turns CC on itself if needed (spec 9.1) and hides the native container; turning Lambë off restores the CC state it found; the user turning CC off turns Lambë off. A track already in the target language costs zero calls and shows as is. Watch pages only (`/watch`); Shorts, embeds and live streams are out of scope.
13. **Entry points.** Options: grow the `<all_urls>` content script, or two YouTube only entries. Choice: `youtube.content.ts` (isolated, `document_idle`) and `youtube-timedtext.content.ts` (MAIN, `document_start`), both on `YOUTUBE_MATCHES`, and the `build:manifestGenerated` hook in `wxt.config.ts` fixed so it rewrites only the page script: today it sets `<all_urls>` on every content script, which would spread the MAIN world hook to every site.

## Global Constraints

- Chrome, Manifest V3. Requests to the provider go from the background worker only, through the existing `lambe/translate` port; the background composition and `BatchTranslationService` logic do not change beyond the brief type and prompt version.
- Lambë never requests `/api/timedtext` itself; it only reads what the player loads, and never alters a request or response.
- Default model `translategemma:12b`, context 2048 tokens; TranslateGemma takes one `user` message, instruction models system plus user.
- Cache key parts unchanged plus `promptVersionOf(brief)`; existing page entries keep their keys.
- TS strict plus `noUncheckedIndexedAccess`; no `as X`, no `!`; no comments except tool directives; no barrel `index.ts`; domain folders; tests mirrored as `*.test.ts`, names in snake case, `bun test`.
- `Result<T, E>` with typed codes, `Option<T>` for absence (no `T | null` in a port), value objects `extends ValueObject<T>` with a Zod `validate`; serialization boundaries (json3, DOM events, port DTO) carry plain values.
- Code and UI text in English. No em dash, en dash or spaced hyphen as punctuation anywhere.
- Git: branch `feat/youtube-captions`, Conventional Commits, one commit per task, stage file by file, never `--no-verify`, no push (no remote).
- Every task ends with `pnpm verify` green (Biome, type check, tests, knip, jscpd, dependency-cruiser).

## Review Focus

1. A pre roll or mid roll ad plays in the same `<video>`: its `currentTime` is not content time. Expected: playhead reported as none, no re-rank, overlay hidden. Pinned in Task 7 (`ad_showing_reports_no_playhead`) and Task 9 (`overlay_is_hidden_while_an_ad_shows`).
2. SPA navigation while a request is in flight. Expected: the request is aborted and its late outcomes never reach the new video's overlay. Pinned in Task 8 (`navigation_aborts_in_flight_and_drops_late_outcomes`).
3. The player loads the same track again (quality change, seek, CC off and on) or the user picks another caption language. Expected: an identical track is ignored, another language restarts the session for it. Pinned in Task 8 (`identical_track_is_ignored`, `new_language_restarts_the_session`).
4. An auto track with no punctuation and a long monologue without pauses. Expected: no sentence above 20 words, no word lost or reordered. Pinned in Task 3 (`unpunctuated_monologue_never_exceeds_twenty_words`, `segmentation_keeps_every_word_in_order`).
5. A caption track already in the target language (or YouTube's own `tlang` translation into it). Expected: zero provider calls, original shown, button in translated state. Pinned in Task 8 (`target_language_track_costs_zero_calls`) and Task 5 (`tlang_sets_the_track_language`).

## File Structure

```
packages/translation/src/
  domain/caption/value-objects/video-id.vo.ts
  domain/caption/{caption-track.ts, caption-sentence.ts, caption-brief.ts, language-rules.ts, segmentation.ts, caption-timeline.ts}
  domain/prompt/{caption-context.ts}            (+ modify prompt-adapter.ts, prompt-version.ts, translategemma-prompt.ts, instruction-prompt.ts)
  domain/page/page-brief.ts                     (modify: kind "page")
  domain/markup/markup.ts                       (modify: plainTextOf)
  application/request-pump.ts
  application/ports/{caption-surface.ts, caption-display.ts}
  application/testing/in-memory-caption-surface.ts
  application/caption-translation.service.ts    (+ modify page-translation.service.ts, batch-translation.service.ts)
  infrastructure/youtube/{json3-track.ts, timedtext-hook.ts, timedtext-channel.ts, youtube-selectors.ts, youtube-player-surface.ts}
  infrastructure/dom/page-brief-reader.ts       (modify: kind "page")
packages/translation/fixtures/youtube/{manual-en.json3.json, asr-en.json3.json, asr-fr.json3.json, watch-player.html}
apps/extension/
  src/permissions.ts  wxt.config.ts  src/config/runtime-config.ts  scripts/check-manifest-key.ts   (modify)
  src/messaging/connect-worker.ts  src/messaging/translate-batch.contract.ts (modify)
  src/youtube/{player-button.ts, player-button.css, caption-overlay.ts, caption-overlay.css}
  src/composition/youtube.ts  src/composition/content.ts (modify: connect-worker)
  entrypoints/{youtube.content.ts, youtube-timedtext.content.ts}
```

Boundaries stay those of `.dependency-cruiser.cjs`: `domain/caption` imports only domain and kernel; the caption service imports domain and application only; `infrastructure/youtube` may import the package. New package exports are added to `packages/translation/package.json` in the task that first needs them in the app.

---

### Task 1: Extract the request pump and the plain text reader

Pure refactor under a guard: `packages/translation/src/application/page-translation.service.test.ts` must pass with zero edits.

**Files:**
- Create: `packages/translation/src/application/request-pump.ts`, `request-pump.test.ts`
- Modify: `packages/translation/src/application/page-translation.service.ts` (remove `drain`, `laneCount`, `concurrency`, `controllers`, `inFlight` bookkeeping, `epoch`, `transportFailure`, `workerDisconnected`, `settle`, `unreachable`, `REQUESTS_AHEAD`, `leading`), `packages/translation/src/domain/markup/markup.ts`, `markup.test.ts`

**Interfaces:**
- Produces, in `request-pump.ts`:
  - `interface RequestScope { epoch: number; signal: AbortSignal }` (moved from the page service).
  - `interface PumpWork<Unit> { canPump(): boolean; take(free: number, concurrency: number): Unit[][]; run(units: Unit[], scope: RequestScope): Promise<Result<void, ProviderError>>; keyOf(unit: Unit): string; drained(failure: Option<ProviderError>): void }`.
  - `class RequestPump<Unit> { constructor(work: PumpWork<Unit>, deps: { capacity: ProviderCapacity; maxConcurrency: number }); schedule(): void; cancelAll(): void; abortWhere(stale: (keys: string[]) => boolean): void; isInFlight(key: string): boolean; isPumping(): boolean; isCurrent(scope: RequestScope): boolean; lead(): void; release(): void; whenIdle(): Promise<void> }`. Rules moved verbatim from the page service: lanes = `max(1, capacity ?? maxConcurrency) + 1`; a rejected `run` becomes `PROVIDER_UNREACHABLE`; a stale scope result is ignored; `REQUEST_CANCELLED` from a live scope is retried once per transport generation, the second gives the "worker disconnected twice" error; any other failure stops taking and is passed to `drained`; `lead()` blocks new lanes until `release()` or the leading lane ends.
  - `plainTextOf(markup: string): Option<string>` in `markup.ts`: some only when the markup parses to exactly one text node (moved from the page service's `plainText`).

- [ ] **Step 1: Failing tests.** `request-pump.test.ts`: `opens_capacity_plus_one_lanes`, `rejected_run_drains_with_provider_unreachable`, `cancel_all_aborts_every_signal_and_ignores_their_results`, `abort_where_aborts_only_matching_requests`, `second_transport_cancel_in_a_row_reports_worker_disconnected`, `lead_blocks_other_lanes_until_release`. `markup.test.ts`: `plainTextOf_reads_a_single_text_node`, `plainTextOf_is_none_for_atoms_or_groups`.
- [ ] **Step 2: Run** `cd packages/translation && bun test src/application/request-pump.test.ts src/domain/markup`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `RequestPump` by moving the code, then make `PageTranslationService` a `PumpWork<Block>` (its `takeNext`, `process` minus the moved parts, `enqueueIfPending`, `apply` stay) and use `plainTextOf`.
- [ ] **Step 4: Run** `bun test` in the package (page service suite untouched and green) and `pnpm verify` (jscpd must not report the pump against the page service).
- [ ] **Step 5: Commit** `refactor(translation): share the request pump between translation services`.

---

### Task 2: Caption vocabulary and a caption aware engine

**Files:**
- Create: `domain/caption/value-objects/video-id.vo.ts`, `domain/caption/{caption-track.ts, caption-sentence.ts, caption-brief.ts}`, `domain/prompt/caption-context.ts`, tests mirrored
- Modify: `domain/page/page-brief.ts`, `domain/prompt/{prompt-adapter.ts, prompt-version.ts, translategemma-prompt.ts, instruction-prompt.ts}` and tests, `application/batch-translation.service.ts` and test, `infrastructure/dom/page-brief-reader.ts`, `apps/extension/src/messaging/translate-batch.contract.ts` and test, every test literal of `PageBrief` (add `kind: "page"`)

**Interfaces:**
- Produces:
  - `class VideoId extends ValueObject<string>`, Zod `^[A-Za-z0-9_-]{11}$`.
  - `interface TimedText { text: string; startMs: number; endMs: number }`; `interface CaptionTrack { videoId: VideoId; language: LanguageCode; generated: boolean; units: TimedText[] }` (`units` are words when `generated`, cues otherwise); `trackSignature(track: CaptionTrack): string` = JSON of `[videoId, language, generated, units.length, last endMs, total text length]`.
  - `interface CaptionSentence { id: BlockId; index: number; startMs: number; endMs: number; text: string }`; `sentenceId(videoId: VideoId, index: number): BlockId` (`<videoId>:<index>`).
  - `interface CaptionBrief { kind: "captions"; host: string; url: string; title: string; channel: string; description: string; generated: boolean; preceding: string[] }`; `PageBrief` gains `kind: "page"`; `type ContentBrief = PageBrief | CaptionBrief` in `prompt-adapter.ts`; `PromptInput.brief` and `BatchRequest.brief` become `ContentBrief`.
  - `CAPTION_PROMPT_VERSION = "c1"` and `promptVersionOf(brief: ContentBrief): string` in `prompt-version.ts`; `BatchTranslationService.keyOf` uses it.
  - `captionContextLines(brief: CaptionBrief, target: LanguageCode): string[]` in `caption-context.ts`, used by both adapters when `brief.kind === "captions"` (in place of the page context line or `briefLines`). Exact copy:
    - `Video: "<title>" by <channel> on <host>.` then `Description: <description cut to 200 chars>` when not empty;
    - `Each line is one sentence of the video's spoken captions, in playback order. Translate every line on its own line as natural spoken <Target name>, short enough to read as a subtitle. Do not merge, split or reorder lines.`;
    - when `generated`: `The captions come from speech recognition: punctuation and capitals may be missing and some words may be misheard. Translate the most likely meaning.`;
    - when `preceding` is not empty: `Previous lines, for context only, do not translate them: <lines joined by " / ">`.
  - Contract: `brief` DTO is a `z.discriminatedUnion("kind", [...])` of the page shape plus `kind: "page"` and the caption shape; `toBatchRequestDto` and `fromBatchRequestDto` map both.

- [ ] **Step 1: Failing tests.**
  - `video-id.vo.test.ts`: `accepts_an_eleven_char_youtube_id`, `rejects_urls_and_short_ids`.
  - `caption-track.test.ts`: `signature_changes_with_language_and_content`.
  - `caption-context.test.ts`: `states_one_sentence_per_line_in_the_target_language`, `adds_the_speech_recognition_rule_only_for_generated`, `lists_preceding_lines_as_context_only`, `cuts_the_description_to_200_chars`.
  - `translategemma-prompt.test.ts`: `caption_brief_keeps_one_user_message_and_the_model_card_opening`, `caption_brief_replaces_the_page_context_line`. `instruction-prompt.test.ts`: `caption_brief_puts_video_context_in_system`.
  - `batch-translation.service.test.ts`: `caption_and_page_segments_with_same_text_use_distinct_cache_keys`, `page_cache_key_is_unchanged_by_the_caption_version` (hash input for a page request still ends with `PROMPT_VERSION`).
  - `translate-batch.contract.test.ts`: `caption_brief_survives_the_port_roundtrip`, `brief_without_kind_is_rejected`.
- [ ] **Step 2: Run** `bun test` in both packages. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures; `page-brief-reader.ts` returns `kind: "page"`. Keep the caption context within the 2048 token budget: `overheadTokens` of a caption brief with a 100 char title, 200 char description and two 120 char preceding lines must stay under 400 (assert it in `caption_brief_keeps_one_user_message_and_the_model_card_opening`).
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add caption vocabulary and caption prompt context`.

---

### Task 3: Sentence re-segmentation of captions

**Files:**
- Create: `domain/caption/{language-rules.ts, segmentation.ts}`, `segmentation.test.ts`

**Interfaces:**
- Consumes: `CaptionTrack`, `CaptionSentence`, `sentenceId`.
- Produces: `segmentSentences(track: CaptionTrack): CaptionSentence[]`; `language-rules.ts` exports `rulesFor(language: LanguageCode): { breakWords: string[]; abbreviations: string[] }` with `en` breaks `and, but, so, because, then, i mean, you know`, abbreviations `mr., mrs., ms., dr., st., vs., e.g., i.e., etc., u.s.`; `fr` breaks `et, mais, donc, parce que, alors, puis, en fait`, abbreviations `m., mme., p. ex., etc., cf.`; others empty.

Rules, in order (generated tracks):
1. Words with blank text are dropped; a `>>` word forces a break and is removed; a bracketed word or run (`[Music]`, `[Musique]`) is a sentence of its own.
2. Punctuation mode when the track has at least 3 words ending with `.`, `?`, `!` or `…` and at least one per 40 words: break after such a word unless it is an abbreviation (case insensitive) or a number followed by a dot.
3. Otherwise pause mode: break where the gap between a word's end and the next word's start exceeds 1000 ms, and before a break word when at least 300 ms elapsed since the sentence start.
4. A sentence over 20 words is split at its largest inner gap, positions 4 to n minus 4, ties broken by a following break word then by closeness to the middle; repeat until none exceeds 20.
5. A piece of 3 words or fewer joins the previous sentence when the gap is at most 1500 ms and the total stays within 20 words, else the next one under the same limits, else stays alone.
6. Timing: start = first word start; end = `min(last word end, next sentence start)`, then raised to at least start plus 1000 ms without passing the next start. Text = words joined by one space, casing untouched.

Manual tracks: one sentence per non blank cue, inner line breaks replaced by one space, cue timing kept.

- [ ] **Step 1: Failing tests** on hand built tracks (one scenario per rule): `drops_blank_words_and_breaks_on_speaker_marks`, `bracketed_sound_is_its_own_sentence`, `punctuated_track_breaks_after_terminal_marks`, `abbreviations_and_numbers_do_not_break`, `unpunctuated_track_breaks_on_pauses_over_one_second`, `breaks_before_a_break_word_after_300_ms`, `unpunctuated_monologue_never_exceeds_twenty_words`, `short_fragment_joins_its_neighbour_within_limits`, `end_is_capped_by_the_next_start_and_lasts_at_least_one_second`, `manual_track_keeps_one_sentence_per_cue`, `segmentation_keeps_every_word_in_order` (concatenated sentence words equal the input words minus blanks and `>>`), `french_rules_apply_to_a_fr_track`.
- [ ] **Step 2: Run** `bun test src/domain/caption`. Expected: FAIL.
- [ ] **Step 3: Implement** `segmentSentences` as a pipeline of small pure functions, one per rule.
- [ ] **Step 4: Run** `bun test src/domain/caption` and `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): re-segment auto captions into timed sentences`.

---

### Task 4: Caption timeline: ranking from the playhead and active lines

**Files:**
- Create: `domain/caption/caption-timeline.ts`, `caption-timeline.test.ts`

**Interfaces:**
- Consumes: `CaptionSentence`, `ProximityRank` from `domain/queue/translation-queue.ts`.
- Produces:
  - `interface CaptionLine { startMs: number; endMs: number; original: string; text: string; translated: boolean }`.
  - `currentIndex(sentences: CaptionSentence[], playheadMs: number): number`: the sentence containing the playhead, else the next one, else the last (binary search, sentences sorted by start).
  - `rankSentences(sentences: CaptionSentence[], playheadMs: number, aheadMs: number): { index: number; rank: ProximityRank; position: number }[]`: rank 0 when the sentence overlaps `[playheadMs, playheadMs + aheadMs]` or is the current one; rank 1 otherwise; `position = (index - current + n) % n`.
  - `activeLines(lines: CaptionLine[], timeMs: number): CaptionLine[]`: lines with `startMs <= timeMs < endMs`, at most 2, earliest first.

- [ ] **Step 1: Failing tests:** `current_index_finds_the_containing_or_next_sentence`, `window_ahead_is_rank_zero`, `sentences_behind_come_last_in_circular_order`, `seek_back_reorders_from_the_new_playhead`, `active_lines_respect_half_open_spans_and_cap_at_two`.
- [ ] **Step 2: Run** `bun test src/domain/caption/caption-timeline.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): rank caption sentences from the playhead`.

---

### Task 5: json3 fixtures and the timedtext parser

**Files:**
- Create: `packages/translation/fixtures/youtube/{manual-en.json3.json, asr-en.json3.json, asr-fr.json3.json}`, an entry per file in `packages/translation/fixtures/README.md`, `infrastructure/youtube/json3-track.ts`, `json3-track.test.ts`

**Interfaces:**
- Consumes: `CaptionTrack`, `VideoId`, `LanguageCode`.
- Produces: `interface TimedtextCapture { url: string; body: string }`; `type TimedtextErrorCode = "TIMEDTEXT_NOT_JSON3" | "TIMEDTEXT_MALFORMED" | "TIMEDTEXT_NO_VIDEO" | "TIMEDTEXT_NO_LANGUAGE" | "TIMEDTEXT_EMPTY"`; `parseTimedtext(capture: TimedtextCapture): Result<CaptionTrack, { code: TimedtextErrorCode; detail: string }>`. URL params: `v` gives the video id, language = `tlang` when present else `lang`, `generated = kind === "asr" && tlang absent`; a `fmt` other than `json3` gives `TIMEDTEXT_NOT_JSON3`. Body Zod schema: `{ events: { tStartMs: number; dDurationMs?: number; aAppend?: number; segs?: { utf8: string; tOffsetMs?: number }[] }[] }`, extra keys allowed. Generated: one unit per non newline seg, `startMs = tStartMs + (tOffsetMs ?? 0)`, `endMs` = next word start, the last word of the track ends at its event end. Manual: one unit per event with text, segs joined, `endMs = tStartMs + dDurationMs`.

- [ ] **Step 1: Save fixtures.** `yt-dlp --skip-download --write-subs --write-auto-subs --sub-format json3 --sub-langs en,fr -o '%(id)s' <url>` on two videos chosen with `yt-dlp --list-subs`: one with a manual `en` track (for example TED `iG9CE55wbtY`), one with automatic captions only (a tech talk, `en`), plus an automatic `fr` track. Trim each to its first 3 minutes of events with `jq`, keep the original URL query (`v`, `lang`, `kind`, `fmt=json3`) in the README entry, which also states the video id, title, date saved and that the captions belong to their authors and serve as test data only.
- [ ] **Step 2: Failing tests:** `manual_fixture_gives_one_unit_per_cue`, `asr_fixture_gives_timed_words_in_order`, `newline_appends_are_not_words`, `tlang_sets_the_track_language`, `non_json3_format_is_rejected`, `missing_video_or_language_is_rejected`, `malformed_body_is_rejected`, and `asr_fixture_segments_into_sentences_of_at_most_twenty_words` (runs `segmentSentences` from Task 3 on the parsed fixture).
- [ ] **Step 3: Run** `bun test src/infrastructure/youtube`. Expected: FAIL.
- [ ] **Step 4: Implement** `parseTimedtext`.
- [ ] **Step 5: Run** the same and `pnpm verify`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(translation): parse the player's json3 caption tracks`.

---

### Task 6: Main world timedtext hook and its channel

**Files:**
- Create: `infrastructure/youtube/{timedtext-hook.ts, timedtext-channel.ts}` and tests

**Interfaces:**
- Consumes: `TimedtextCapture`.
- Produces:
  - `installTimedtextHook(target: { XMLHttpRequest: typeof XMLHttpRequest; fetch: typeof fetch }, emit: (capture: TimedtextCapture) => void): void`: wraps `XMLHttpRequest.prototype.open` (remember the URL) and `send` (on `load` with status 200 and a path ending in `/api/timedtext`, emit `responseText`), and `fetch` (same filter, `response.clone().text()`). Never changes arguments, results or timing; any error inside the observer is swallowed so YouTube never sees it; installing twice is a no op.
  - `TIMEDTEXT_EVENT = "lambe:timedtext"`, `READY_EVENT = "lambe:timedtext-ready"`, `MAX_BODY_CHARS = 5_000_000`.
  - `createTimedtextRelay(doc: Document): { publish(capture: TimedtextCapture): void }`: dispatches `CustomEvent(TIMEDTEXT_EVENT, { detail: JSON.stringify(capture) })` on `doc`, keeps the last 3 captures and replays them on each `READY_EVENT`.
  - `listenTimedtext(doc: Document, onCapture: (capture: TimedtextCapture) => void): () => void`: listens, then dispatches `READY_EVENT`; `detail` must be a string under `MAX_BODY_CHARS`, JSON, and match `z.object({ url: z.string().url(), body: z.string() })`, otherwise it is ignored.

- [ ] **Step 1: Failing tests** with fake `XMLHttpRequest` and `fetch` classes: `xhr_timedtext_response_is_emitted_unchanged`, `fetch_timedtext_response_is_emitted_and_the_page_still_reads_the_body`, `other_urls_and_non_200_are_ignored`, `observer_error_never_reaches_the_page`, `installing_twice_emits_once`; channel: `capture_published_before_the_listener_is_replayed_on_ready`, `forged_or_oversized_detail_is_ignored`, `relay_keeps_only_the_last_three`.
- [ ] **Step 2: Run** `bun test src/infrastructure/youtube`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): observe the player's caption responses from the main world`.

---

### Task 7: YouTube player surface

**Files:**
- Create: `application/ports/{caption-surface.ts, caption-display.ts}`, `infrastructure/youtube/{youtube-selectors.ts, youtube-player-surface.ts}`, `youtube-player-surface.test.ts`, `packages/translation/fixtures/youtube/watch-player.html` (hand trimmed from a real watch page: `#movie_player.html5-video-player` with `video.html5-main-video`, `.ytp-right-controls` holding `.ytp-subtitles-button[aria-pressed]`, `.ytp-caption-window-container`, `ytd-watch-metadata h1`, `ytd-channel-name a`, `meta[name=description]`)

**Interfaces:**
- Consumes: `CaptionTrack`, `VideoId`, `parseTimedtext`, `listenTimedtext`.
- Produces:
  - `interface CaptionSurfaceListener { onTrack(track: CaptionTrack): void; onPlayhead(ms: Option<number>, seeked: boolean): void; onNavigate(videoId: Option<VideoId>): void; onCaptionsOff(): void }`.
  - `interface CaptionSurface { videoId(): Option<VideoId>; playheadMs(): Option<number>; readBrief(): Omit<CaptionBrief, "generated" | "preceding">; watch(listener: CaptionSurfaceListener): () => void; loadCaptions(): void; restoreCaptions(): void; hideNative(hidden: boolean): void }`.
  - `interface CaptionDisplay { update(lines: CaptionLine[]): void; clear(): void }`.
  - `class YoutubePlayerSurface implements CaptionSurface { constructor(deps: { doc: Document; window: Window }) }`. Video id from `location` `v` on `/watch` only. Playhead none while the player has `ad-showing`. `timeupdate` gives `seeked: false`, `seeked` gives `true`. `yt-navigate-finish` gives `onNavigate`. Tracks come from `listenTimedtext` then `parseTimedtext`; failures are logged with `console.debug` and dropped; tracks of another video than `videoId()` are dropped. `loadCaptions` clicks `.ytp-subtitles-button` only when `aria-pressed="false"` and remembers it; `restoreCaptions` clicks it back only if Lambë turned it on; an `aria-pressed` change to `false` not caused by Lambë calls `onCaptionsOff`. `hideNative` toggles the class `lambe-native-captions-hidden` on the player and installs once a `<style id="lambe-youtube">` hiding `.ytp-caption-window-container` under that class.
  - `youtube-selectors.ts`: one `const YOUTUBE_SELECTORS` object holding every selector above, the only place that names them.

- [ ] **Step 1: Failing tests** on the fixture in happy-dom: `reads_video_id_title_channel_and_description`, `non_watch_page_has_no_video_id`, `ad_showing_reports_no_playhead`, `seeked_is_flagged`, `navigate_finish_reports_the_new_video`, `track_of_another_video_is_dropped`, `load_captions_clicks_cc_only_when_off_and_restore_undoes_it`, `user_turning_cc_off_is_reported`, `hide_native_hides_the_caption_container`.
- [ ] **Step 2: Run** `bun test src/infrastructure/youtube`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): read and drive the youtube player`.

---

### Task 8: Caption translation service

**Files:**
- Create: `application/caption-translation.service.ts`, `caption-translation.service.test.ts`, `application/testing/in-memory-caption-surface.ts` (same role as `in-memory-page-surface.ts`)

**Interfaces:**
- Consumes: `RequestPump`, `TranslationQueue`, `BatchTranslator`, `ProviderCapacity`, `CaptionSurface`, `CaptionDisplay`, `segmentSentences`, `rankSentences`, `trackSignature`, `plainTextOf`, `toMarkup`, `ViewState` from `page-translation.service.ts`.
- Produces: `class CaptionTranslationService { constructor(deps: { surface: CaptionSurface; display: CaptionDisplay; translator: BatchTranslator; capacity: ProviderCapacity; target: LanguageCode; maxConcurrency: number; sentencesPerRequest: number; aheadMs: number }); attach(): () => void; toggle(): Promise<void>; state(): ViewState; subscribe(listener: (state: ViewState) => void): () => void; whenIdle(): Promise<void> }`.

Behavior:
- `attach` watches the surface from page load and keeps the last track per video, so a click after the player loaded captions starts at once. `toggle` from original: `loadCaptions`, `hideNative(true)`, state `translating`; once a track is known, segment it, display every sentence as its original, rank from the playhead and pump. `toggle` when active: `pump.cancelAll()`, `display.clear()`, `hideNative(false)`, `restoreCaptions()`, state `original`.
- Requests: the first one after activation or a seek holds the single current sentence and calls `pump.lead()`; then `queue.take(sentencesPerRequest, 1)` in rank then position order. Each `BatchRequest` has `source = Option.some(track.language)`, `cachePolicy: "use"`, segments `{ id: index, markup: toMarkup([{ kind: "text", text }]) }`, and a `CaptionBrief` from `surface.readBrief()` with `generated` and `preceding` (the 2 sentences before the first segment). Each outcome from `onOutcome` or the result updates the line through `plainTextOf` and calls `display.update`; failed outcomes settle the sentence with its original.
- `onPlayhead` re-ranks when the current index changes; with `seeked` it also calls `pump.abortWhere` on requests with no rank 0 sentence and sets the leading single sentence request again. Aborted sentences go back to the queue.
- Translations stay in memory per `trackSignature` (last 5 tracks), so toggling back on is instant and sends nothing for settled sentences.
- State: `translated` when every sentence is settled; `error` with the provider error (button tooltip) while originals stay shown.

- [ ] **Step 1: Failing scenarios** (given, when, then; translator mocked with `mock()` as in `page-translation.service.test.ts`):
  - `first_request_holds_only_the_sentence_at_the_playhead`
  - `following_requests_cover_the_window_ahead_then_the_rest_in_order`
  - `translations_reach_the_display_as_they_stream`
  - `pending_and_failed_sentences_show_their_original`
  - `seek_forward_aborts_far_requests_and_starts_at_the_new_playhead`
  - `navigation_aborts_in_flight_and_drops_late_outcomes`
  - `activation_is_sticky_across_navigation`
  - `identical_track_is_ignored`
  - `new_language_restarts_the_session`
  - `target_language_track_costs_zero_calls`
  - `toggle_off_restores_native_captions_and_cc_state`
  - `toggle_on_again_is_instant_and_sends_nothing`
  - `user_turning_cc_off_turns_lambe_off`
  - `provider_error_sets_error_state_and_keeps_originals`
  - `request_brief_carries_generated_flag_and_two_preceding_sentences`
- [ ] **Step 2: Run** `bun test src/application/caption-translation.service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the service as a `PumpWork<CaptionSentence>` over a `TranslationQueue`; no lanes, abort or retry code of its own.
- [ ] **Step 4: Run** `bun test` in the package and `pnpm verify` (jscpd clean against the page service). Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): translate captions ahead of the playhead`.

---

### Task 9: Player button and caption overlay

**Files:**
- Create: `apps/extension/src/youtube/{player-button.ts, player-button.css, caption-overlay.ts, caption-overlay.css}` and `player-button.test.ts`, `caption-overlay.test.ts`

**Interfaces:**
- Consumes: `ViewState`, `CaptionLine`, `activeLines`, `CaptionDisplay`, `YOUTUBE_SELECTORS`, `assets/tengwa-lambe.svg?raw` (as `bubble-view.ts` does).
- Produces:
  - `mountPlayerButton(doc: Document, onClick: () => void): { render(state: ViewState): void; destroy(): void }`: a `button.ytp-button.lambe-ytp-button` with `aria-label="Translated captions (Lambë)"`, `aria-pressed`, the glyph in white, inserted right before `.ytp-subtitles-button`; a `MutationObserver` on the player puts it back whenever YouTube rebuilds the controls. `aria-pressed="true"` for translating and translated, a pulse class while translating, `data-state="error"` and `title` set to the error message on error. `player-button.css` (injected by the manifest) copies the CC look: red bar under the glyph when pressed.
  - `mountCaptionOverlay(doc: Document): CaptionDisplay & { destroy(): void }`: host `lambe-captions` inside `#movie_player`, `position: absolute; inset: 0; pointer-events: none; container-type: size`, open shadow root with `caption-overlay.css?raw` (tokens as custom properties on `:host`: text white, background `rgb(8 8 8 / 75%)`, font size `max(14px, min(2.2cqw, 4.2cqh))`, bottom `2%`, `64px` when `:host([data-controls="shown"])`, `display: none` for `:host([data-ad])`). Renders `activeLines(lines, video.currentTime * 1000)` on a `requestAnimationFrame` loop while the video plays and on `seeked`, `pause` and `update`; mirrors `ytp-autohide` and `ad-showing` of the player into `data-controls` and `data-ad`; re-mounts if YouTube removes the host.

- [ ] **Step 1: Failing tests** (happy-dom, `watch-player.html` fixture): `button_sits_right_before_cc`, `button_comes_back_after_controls_rebuild`, `button_reflects_each_view_state`, `overlay_mounts_inside_the_player`, `overlay_shows_active_lines_at_current_time`, `overlay_lifts_when_controls_show`, `overlay_is_hidden_while_an_ad_shows`, `clear_empties_the_overlay`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/youtube`. Expected: FAIL.
- [ ] **Step 3: Implement** in the style of `src/bubble/bubble-view.ts` (plain DOM, no framework inside YouTube's player).
- [ ] **Step 4: Run** the same and `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): add the youtube player button and caption overlay`.

---

### Task 10: YouTube composition, entry points and manifest

**Files:**
- Create: `apps/extension/src/messaging/connect-worker.ts`, `src/composition/youtube.ts`, `entrypoints/youtube.content.ts`, `entrypoints/youtube-timedtext.content.ts`
- Modify: `src/composition/content.ts` (import `connectWorker`), `src/permissions.ts`, `wxt.config.ts`, `src/config/runtime-config.ts` and test, `scripts/check-manifest-key.ts`, `packages/translation/package.json` (exports for `caption-translation.service`, `infrastructure/youtube/*` used by the app)

**Interfaces:**
- Consumes: everything above, `PortBatchTranslator`, `loadRuntimeConfig`.
- Produces:
  - `YOUTUBE_MATCHES = ["https://www.youtube.com/*"]` in `permissions.ts`.
  - `RuntimeConfig` gains `captionSentencesPerRequest: 6` and `captionAheadMs: 60000` (positive ints, overridable like the others).
  - `startYoutube(ctx: ContentScriptContext): void`: builds `YoutubePlayerSurface`, `mountCaptionOverlay`, `CaptionTranslationService` with a `PortBatchTranslator(connectWorker)` as translator and capacity, `attach()`, mounts the button with `toggle`, re-renders it on `subscribe`, warms the port on click like `content.ts`, tears down on `ctx.onInvalidated`.
  - `youtube-timedtext.content.ts`: `defineContentScript({ matches: YOUTUBE_MATCHES, runAt: "document_start", world: "MAIN", main: () => installTimedtextHook(window, createTimedtextRelay(document).publish) })`.
  - `youtube.content.ts`: `matches: YOUTUBE_MATCHES`, `runAt: "document_idle"`, `cssInjectionMode: "manifest"`, imports `player-button.css`, calls `startYoutube(ctx)`.
  - `wxt.config.ts` hook: rewrites `matches` and `all_frames` only for the script whose `matches` contain `<all_urls>`; YouTube scripts keep `YOUTUBE_MATCHES` and top frame only.
  - `check-manifest-key.ts` also fails when the MAIN world script is missing, not at `document_start`, or matches anything beyond `YOUTUBE_MATCHES`.

- [ ] **Step 1: Failing tests:** `runtime-config.test.ts`: `caption_defaults_are_six_sentences_and_sixty_seconds`, `caption_overrides_are_applied`. Build check: `pnpm --filter @lambe/extension build && pnpm --filter @lambe/extension check:manifest` must fail before the hook fix (the MAIN world script gets `<all_urls>`).
- [ ] **Step 2: Implement** the files above.
- [ ] **Step 3: Run** `pnpm verify`, then the build and `check:manifest` (dev) and `LAMBE_STORE=1` store build plus `check:manifest`. Expected: PASS; `manifest.json` lists three content scripts, the MAIN one on `https://www.youtube.com/*` at `document_start`.
- [ ] **Step 4: Commit** `feat(extension): translate youtube captions from the player button`.

---

### Task 11: Real browser proof on YouTube

**Files:**
- Modify: `README.md` (section "Plan 3 verification" and a "YouTube captions" usage paragraph); owning task files only if the proof exposes a bug, test first

Run in Chrome with the claude in chrome tools, or Brave over CDP as in the Plan 1 verification, with the unpacked build from Task 10, `translategemma:12b` on local Ollama, target `fr`, cache cleared before each video. Videos: the two fixture videos of Task 5 (manual `en`, automatic `en` only); their ids go in the README.

- [ ] **Step 1: Capture.** On each video, before any click, check from the service worker side that zero requests to `/api/timedtext` come from the extension (`read_network_requests`: every timedtext request has the player as initiator) and that the isolated script holds the track (`console.debug` line with sentence count).
- [ ] **Step 2: Latency.** From a cold start at 0:30, click the button and record: time to the first translated line on screen, then during 3 minutes of continuous playback at 1x, sampled every second with `javascript_tool`, the lead = end time of the last contiguous translated sentence minus the playhead. Expected: first line under 3 s, lead never negative after the first 10 s. Record min, median and the number of requests to `/api/chat`.
- [ ] **Step 3: Seek.** Seek to 50 % and to 90 %: time to the first translated line at the new playhead (expected under 3 s), and that in-flight requests for the old position were cancelled (worker console `cancel` messages).
- [ ] **Step 4: Correctness.** For 20 consecutive sentences of each video: original and translation side by side in the README; every overlay line is shown only inside its sentence span (`MutationObserver` on the shadow root versus `video.currentTime`, tolerance 100 ms); no sentence of the auto track over 20 words; tech terms kept as in Plan 1 (no "fourchette" type literalism); native captions hidden while active.
- [ ] **Step 5: Player modes.** Screenshots in default, theater and fullscreen: overlay inside the video, lifted above the controls when they show, hidden during an ad if one plays. Second click: native captions back with the CC state found before. Third click: translated lines back with zero new `/api/chat` requests.
- [ ] **Step 6: Navigation.** Click a recommended video while active: button present, overlay shows the new video's lines only, no request for the previous video after the click. Turn CC off by hand: Lambë turns off.
- [ ] **Step 7: Console.** `read_console_messages` on the watch page and the service worker: no errors from Lambë, no new YouTube errors compared with the extension disabled.
- [ ] **Step 8: Record** the measured numbers and the side by side samples in "Plan 3 verification"; a failed expectation is fixed with a test in the owning task first, never by weakening the check.
- [ ] **Step 9: Run** `pnpm verify`. Expected: PASS, output attached to the report.
- [ ] **Step 10: Commit** `docs: record the youtube captions proof`.

---

### Task 12: Roadmap

**Files:**
- Modify: `docs/superpowers/plans/2026-10-18-roadmap.md`

- [ ] **Step 1:** Set the Plan 3 row status to `Built and verified on feat/youtube-captions, see README` and add the plan file name to the Plan 3 paragraph, plus one line on what Plan 4 plugs into (`CaptionTrack` with `generated: false` sentences from the companion feed the same `CaptionTranslationService`).
- [ ] **Step 2: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 3: Commit** `docs: mark plan 3 built and verified in the roadmap`.

---

## Self-review notes

- Coverage: 6.3 button (Tasks 9, 10), toggle and instant return (8, 11), own overlay replacing native (7, 9); 9.1 player responses through the main world (5, 6), loading the track without showing it (7); 9.2 re-segmentation (3), neighbour window (2, 8), mapping onto source timing (3, 4), whole track from the current time and seeks (4, 8, 11); 13 boundaries and checks in every task; 4 anti goals: no page breakage (hook read only and error proof, Task 6), quiet UI (YouTube styled button), no unconfigured cloud (same worker and provider).
- Reuse, named: `BatchTranslationService` (batching, budget, split, validation, retry, streaming previews, cache), `StorageTranslationCache`, `sha256Hasher`, `OllamaProvider`, `AdaptiveConcurrencyProvider`, prompt adapters, `TranslationQueue`, `RequestPump` (extracted from `PageTranslationService`), `PortBatchTranslator` and the `lambe/translate` contract and handler, `ProviderError` and `requestCancelled`, `LanguageCode.sharesPrimarySubtagWith`, `BlockId`, `ViewState`, `loadRuntimeConfig`, the `?raw` glyph import.
- Spec gaps, handled by the Decisions: which track when several exist (the one the player loads wins); "click again: original captions" read as native captions back; no rule for a human track already in the target language (not used in this plan, see open risks); cache key and prompt version for captions; Shorts, embeds and live streams unaddressed (out of scope).
- Open risks: YouTube may move to SABR or another format for captions (Task 6 tests the filter, Task 11 proves the live path); a manual track in the target language could be loaded through the player (`setOption("captions", "track", …)`) to skip the GPU entirely, left for a later plan; TranslateGemma may merge short lines (the line format and per segment validation already reject that and retry).
