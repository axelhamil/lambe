# Lambë Plan 1: Engine, Page Translation, Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click the bubble (or press the shortcut) on any page and the visible part is translated in place by a local Ollama model, code untouched, with an instant toggle back to the exact original.

**Architecture:** A framework free `packages/translation` (domain, application, infrastructure) holds segmentation model, placeholder markup, prompt adapters, batching, validation, queue, cache policy and the DOM adapter. `apps/extension` (WXT) is the composition root: a background worker owns the provider, cache and batch service; a content script owns the page session and the bubble (Shadow DOM). They talk through one typed message contract. The DOM is patched in place (original nodes never detached), so host frameworks keep working and restore is exact.

**Tech Stack:** TypeScript 7.0.2 strict, Bun 1.4.3 (`bun test`), pnpm workspaces, WXT 0.21.4 (Vite, MV3), Zod 4.6.7, happy-dom 21.0.3 (tests), Biome 2.5.15, knip 6.41.0, jscpd 5.4.1, dependency-cruiser 18.6.0, husky 9.1.7, commitlint 21.2.3 (all checked with `npm view` on 2026-10-18). Ollama native API.

**Spec:** `docs/superpowers/specs/2026-10-18-lambe-design.md` (sections 6.1, 6.2, 7, 8, 12 steps 1 and 2, 13). Bubble behavior reference: `docs/mockups/bubble-lambe.fragment.html`. Sibling repo used as shape reference: `../afterlive` (`packages/libs/ddd-kit`, `biome.json`, `knip.json`, `.dependency-cruiser.cjs`, `commitlint.config.mjs`, `.jscpd.json`, `.husky/`).

## Global Constraints

- Chrome, Manifest V3 only. Requests to the provider go from the background worker, never the page context.
- Default model `translategemma:12b`, concurrency 1 for local Ollama, context 2048 tokens for TranslateGemma. TranslateGemma takes one `user` message, no system message; instruction models take system plus user.
- Excluded subtrees: `script`, `style`, `noscript`, `pre`, `code`, `kbd`, `samp`, `var`, `textarea`, `input`, `select`, `[contenteditable]`, `[translate="no"]`, `.notranslate`, `svg`, `math`.
- Cache key = hash(source text, source lang, target lang, provider, model, prompt version). Prompt version is part of the key. Cache survives restart.
- Lazy: viewport plus one screen ahead; far blocks dropped from the queue. Click toggles from memory; double click within 250 ms re-translates bypassing and overwriting the cache.
- Bubble: 38 px, about 55 % opacity at rest, 100 % on hover or translated, accent `#7ee0c3`, snaps to the nearest left or right edge keeping its vertical position, tail flips. Glyph from `assets/tengwa-lambe.svg`.
- Host permission declared in one place (`<all_urls>` for v1). Default target language: browser UI language.
- TS strict plus `noUncheckedIndexedAccess`; no `as X`, no `!`; no comments except tool directives; no barrel `index.ts`; domain folders, never flat `utils` or `lib`; tests mirrored next to sources as `*.test.ts`.
- `Result<T, E>` with typed codes for business errors, `Option<T>` for absence (no `T | null` in a port); Zod for contracts and config; value objects `extends ValueObject<T>` with a real Zod `validate`.
- Code, UI text and docs in English. No em dash, en dash or spaced hyphen as punctuation anywhere.
- Git: Conventional Commits, subject lower case, no trailing period, at most 72 chars; one commit per task, stage file by file (never `-A` or `.`), never `--no-verify`; push after each commit when a remote exists.

## Review Focus

Five failure modes the spec implies and the tasks do not otherwise force. Each is pinned by a test in the owning task.

1. React or Vue hydrated page: the framework keeps references to text nodes and later calls `parent.removeChild(textNode)` or updates `nodeValue`. Replacing nodes would throw `NotFoundError` and break the page. Expected: original nodes stay attached, restore is exact. Pinned in Task 9 (`framework_removeChild_on_original_text_node_does_not_throw`).
2. The model drops, duplicates or moves a placeholder or paired tag. Expected: the response is rejected, retried once alone, then the block degrades to per text node translation, then to the original; protected nodes never change. Pinned in Task 3 (validation) and Task 5 (retry and degrade scenarios).
3. A block longer than TranslateGemma's 2K context (a minified code comment, a giant table cell, one paragraph of 9000 characters). Expected: split at sentence boundaries outside groups, translated piece by piece, joined in order; never a truncated or silently dropped block. Pinned in Task 4 (budget and split) and Task 5.
4. The page is already in the target language (or is mixed). Expected: zero provider calls for blocks detected as target, no error, bubble goes straight to translated state. Pinned in Task 7.
5. Ollama refuses the extension origin (403) or is down. Expected: no retry loop, no page change, bubble error state with the exact `OLLAMA_ORIGINS` systemd fix. Pinned in Task 6 (code mapping) and Task 11 (tooltip content).

## File Structure

```
package.json  pnpm-workspace.yaml  biome.json  knip.json  .jscpd.json  .dependency-cruiser.cjs
commitlint.config.mjs  release-please-config.json  .release-please-manifest.json  .github/workflows/ci.yml
packages/kernel/src/{primitives/result.ts, primitives/option.ts, domain/value-object.ts}
packages/translation/src/
  domain/language/{value-objects/language-code.vo.ts, skip-policy.ts}
  domain/block/{value-objects/block-id.vo.ts, inline-node.ts, block.ts, block-translation.ts}
  domain/page/page-brief.ts
  domain/markup/{markup.ts, structure-check.ts, comment-marker.ts}
  domain/prompt/{prompt-version.ts, prompt-adapter.ts, translategemma-prompt.ts, instruction-prompt.ts}
  domain/batch/{budget.ts, split.ts, batch-format.ts}
  domain/cache/{cache-key.ts, cache-policy.ts}
  domain/queue/translation-queue.ts
  domain/provider/provider-error.ts
  application/ports/{translation-provider.ts, translation-cache.ts, hasher.ts, language-detector.ts, page-surface.ts, batch-translator.ts}
  application/{batch-translation.service.ts, page-translation.service.ts}
  infrastructure/providers/{ollama-provider.ts, concurrency-limited-provider.ts}
  infrastructure/hashing/sha256-hasher.ts
  infrastructure/dom/{block-reader.ts, protected-nodes.ts, page-brief-reader.ts, dom-page-surface.ts, block-watcher.ts}
packages/translation/fixtures/{github-fork-a-repo.html, spa-feed.html, react-like-page.html}
apps/extension/
  wxt.config.ts  src/permissions.ts  src/config/runtime-config.ts
  src/messaging/{translate-batch.contract.ts, toggle.contract.ts}
  src/adapters/chrome/{storage-translation-cache.ts, chrome-language-detector.ts, runtime-batch-translator.ts}
  src/composition/{background.ts, content.ts}
  src/bubble/{placement.ts, click-classifier.ts, bubble-state.ts, bubble-view.ts, bubble.css}
  entrypoints/{background.ts, content.ts}
  scripts/serve-fixtures.ts  proof/proof.html
README.md
```

Boundaries (enforced by dependency-cruiser from Task 2): `domain` imports only `domain` and `@lambe/kernel`; `application` imports `domain`, `application`, kernel; `infrastructure` may import all of the package; `packages/*` never import `apps/*`; `apps/extension` imports packages only through their `exports`; no cycles.

---

### Task 1: Repo bootstrap and shared kernel

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (24.20.0), `.gitignore`, `.editorconfig`, `biome.json`, `knip.json`, `.jscpd.json`, `commitlint.config.mjs`, `.husky/commit-msg`, `.husky/pre-commit`
- Create: `packages/kernel/package.json`, `packages/kernel/tsconfig.json`, `packages/kernel/src/primitives/result.ts`, `packages/kernel/src/primitives/option.ts`, `packages/kernel/src/domain/value-object.ts` and their `*.test.ts`
- Create: `packages/typescript-config/{package.json,base.json,bun.json}`

**Interfaces:**
- Produces (`@lambe/kernel`, exports `./result`, `./option`, `./value-object`):
  - `class Result<T, E = string>`: `static ok<T, E>(value: T): Result<T, E>`, `static ok<E>(): Result<void, E>`, `static fail<T, E>(error: E): Result<T, E>`, `isSuccess`, `isFailure`, `getValue(): T`, `getError(): E`, `unwrapOr`, `map`, `flatMap`, `mapError`, `match({ ok, fail })`.
  - `abstract class Option<T>`: `Option.some`, `Option.none`, `Option.fromNullable`, `isSome`, `isNone`, `unwrap`, `unwrapOr`, `map`, `flatMap`, `filter`, `toUndefined`, `toResult<E>(error: E)`.
  - `abstract class ValueObject<T>`: `get value(): T` (frozen), `equals`, `protected abstract validate(value: T): Result<T, string>`, `static create(value): Result<instance, string>`.

- [ ] **Step 1: Prepare git.** Run `git status`. Commit the existing spec, mockup and `assets/` on `main` as `docs: add design spec, mockup and glyph` (stage each file by path), then `git branch dev` and `git switch -c feat/page-translation dev`. Expected: `git branch` lists `main`, `dev`, `feat/page-translation` with the last one current.
- [ ] **Step 2: Workspace and toolchain.** Create the files above. `package.json` scripts: `check` (`biome check .`), `fix`, `type-check` (`pnpm -r --if-present run type-check`), `test` (`pnpm -r --workspace-concurrency=1 --if-present run test`), `check:unused` (`knip`), `check:duplication` (`jscpd ./packages ./apps`), `check:boundaries` (`depcruise apps packages --config .dependency-cruiser.cjs`), `verify` running all of them in order, `prepare` (`husky`). Model `biome.json`, `knip.json`, `.jscpd.json`, `commitlint.config.mjs` and `.husky/*` on the Afterlive files named in the header, minus its Grit plugins except `no-empty-validate.grit` and `no-foreign-props-access.grit`, copied to `tooling/biome-plugins/` and scoped to `packages/translation/src/domain/**`. Add Biome rules `noNonNullAssertion: error`, `noExplicitAny: error`, `noBarrelFile: error`, `useImportType`. `tsconfig` base: strict, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, `moduleResolution: Bundler`, `target: ES2023`, `lib: ["ESNext", "DOM"]`. Copy Afterlive's `packageExtensions` for `dependency-cruiser` (typescript ^6) in `pnpm-workspace.yaml` because TypeScript is 7. Run `pnpm install` once, with versions from the header.
- [ ] **Step 3: Write failing kernel tests** next to each file (`bun test`):
  - `result.test.ts`: `ok_exposes_value`, `fail_exposes_error`, `getValue_on_failure_throws`, `map_and_flatMap_short_circuit_on_failure`, `match_calls_the_right_branch`.
  - `option.test.ts`: `fromNullable_maps_null_and_undefined_to_none`, `some_map_applies`, `none_unwrapOr_returns_default`, `toResult_fails_with_given_error_on_none`.
  - `value-object.test.ts` with a tiny subclass validated by a Zod schema: `create_returns_failure_when_schema_rejects`, `create_returns_instance_when_valid`, `value_is_frozen`, `equals_compares_by_key_ordered_json_for_objects`.
- [ ] **Step 4: Run to see them fail.** `cd packages/kernel && bun test`. Expected: FAIL, modules not found.
- [ ] **Step 5: Implement the three files** following the signatures above, reading `afterlive/packages/libs/ddd-kit/src/primitives/result.ts`, `option.ts` and `domain/value-object.ts` for shape. Differences from Afterlive, required by the author's rules: no `!` and no `as` (store `Result` state as a discriminated union field, call `new this(value)` inside `static create` using the `this: new (value: V) => T` parameter), no `biome-ignore`, no `Result.all`, no `toNull` (YAGNI).
- [ ] **Step 6: Verify.** `pnpm verify` (everything but boundaries may be vacuous yet must exit 0; `check:boundaries` is added in Task 2). Expected: kernel tests PASS, biome, tsc, knip, jscpd clean. A commit with a non conventional subject must be rejected by the hook: run `git commit --allow-empty -m "Bad subject"` and expect failure.
- [ ] **Step 7: Commit** `chore: bootstrap pnpm workspace, tooling and kernel primitives`.

---

### Task 2: Language and identity vocabulary, boundaries check

**Files:**
- Create: `packages/translation/{package.json,tsconfig.json}`, `.dependency-cruiser.cjs` (root)
- Create: `packages/translation/src/domain/language/value-objects/language-code.vo.ts`, `.../skip-policy.ts`, `domain/block/value-objects/block-id.vo.ts`, `domain/page/page-brief.ts`, `domain/provider/provider-error.ts`, `domain/cache/cache-policy.ts`
- Test: mirrored `*.test.ts`

**Interfaces:**
- Consumes: `ValueObject`, `Result`, `Option` from `@lambe/kernel`.
- Produces (`@lambe/translation` exports `./domain/*`, `./application/*`, `./infrastructure/*` as `./src/<dir>/*.ts` patterns):
  - `class LanguageCode extends ValueObject<string>`; Zod `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$`, lower cases the primary subtag; `LanguageCode.create("fr")`; `LanguageCode.create("French")` fails.
  - `class BlockId extends ValueObject<string>`, non empty, no whitespace; `BlockId.create("b12")`.
  - `interface PageBrief { host: string; title: string; description: string; headings: string[]; sourceLanguage: Option<LanguageCode> }`.
  - `type CachePolicy = "use" | "refresh"`.
  - `type ProviderErrorCode = "PROVIDER_UNREACHABLE" | "PROVIDER_FORBIDDEN_ORIGIN" | "PROVIDER_MODEL_MISSING" | "PROVIDER_BAD_RESPONSE" | "PROVIDER_TIMEOUT"`; `interface ProviderError { code: ProviderErrorCode; message: string }`; `providerError(code, message): ProviderError`.
  - `shouldSkipBlock(input: { detected: Option<LanguageCode>; target: LanguageCode; charCount: number }): boolean` in `skip-policy.ts`: skip when the detected language equals the target (primary subtag compare) and `charCount >= 12`; never skip when detection is none.

- [ ] **Step 1: Failing tests.**
  - `language-code.vo.test.ts`: `accepts_fr_and_pt-BR`, `normalizes_FR_to_fr`, `rejects_free_text`.
  - `skip-policy.test.ts`: `skips_a_reliable_target_language_block`, `does_not_skip_short_blocks_even_if_target`, `does_not_skip_when_detection_is_none`, `pt-BR_target_skips_pt_detection`.
  - `block-id.vo.test.ts`: `rejects_empty_and_whitespace`.
- [ ] **Step 2: Run** `cd packages/translation && bun test`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above; each `validate` calls a Zod schema `safeParse` and returns the first issue message (no empty validate, enforced by the Grit plugin).
- [ ] **Step 4: Add `.dependency-cruiser.cjs`** with the rules named in File Structure (pure domain, application not importing infrastructure, packages not importing apps, no cycles, `apps/extension` importing packages only through `exports`), modeled on Afterlive's file. Add `check:boundaries` to `verify`. Prove it works: temporarily import `../infrastructure/x` from a domain file, expect `pnpm check:boundaries` to fail, then revert.
- [ ] **Step 5: Run** `pnpm verify`. Expected: PASS, boundaries clean.
- [ ] **Step 6: Commit** `feat(translation): add language, block id and provider error vocabulary`.

---

### Task 3: Inline model, placeholder markup and structure validation

**Files:**
- Create: `domain/block/{inline-node.ts, block.ts, block-translation.ts}`, `domain/markup/{markup.ts, structure-check.ts, comment-marker.ts}`
- Test: mirrored

**Interfaces:**
- Consumes: `BlockId`, `Result`.
- Produces:
  - `type InlineNode = TextNode | AtomNode | GroupNode` with `TextNode { kind: "text"; text: string }`, `AtomNode { kind: "atom"; key: number }` (a protected inline thing: code, kbd, URL link, img, br), `GroupNode { kind: "group"; key: number; children: InlineNode[] }` (formatting wrapper that may reorder inside its parent).
  - `interface Block { id: BlockId; nodes: InlineNode[] }`.
  - `type BlockTranslation = { blockId: BlockId; kind: "structured"; nodes: InlineNode[] } | { blockId: BlockId; kind: "text-slots"; texts: string[] }`; `text-slots` index `i` is the i-th text node of the source in depth first order.
  - `type MarkupErrorCode = "MARKUP_MALFORMED" | "PLACEHOLDER_LOST" | "PLACEHOLDER_DUPLICATED" | "STRUCTURE_MOVED"`; `interface MarkupError { code: MarkupErrorCode; detail: string }`.
  - `toMarkup(nodes: InlineNode[]): string`: text escaped (`&`, `<`, `>`), atom `<x{key}/>`, group `<g{key}>...</g{key}>`, whitespace runs collapsed to one space, block edges trimmed.
  - `parseMarkup(markup: string): Result<InlineNode[], MarkupError>` (inverse, unescapes).
  - `checkAgainstSource(source: InlineNode[], translated: InlineNode[]): Result<InlineNode[], MarkupError>`: every atom key and group key of the source present exactly once; each atom or group has the same parent group as in the source (so the DOM can be patched without re-parenting); order inside a parent is free.
  - `textSlots(nodes: InlineNode[]): string[]` (text of each text node, depth first) and `textNodeCount(nodes)`.
  - `splitCommentMarker(text: string): { prefix: string; body: string; suffix: string }` for `//`, `#`, `--`, `;`, `/* */`, `<!-- -->` and leading `*` continuation lines.

- [ ] **Step 1: Failing tests.**
  - `markup.test.ts`: `roundtrips_text_atoms_and_nested_groups`, `escapes_angle_brackets_and_ampersands` (`"a < b && c"` survives), `collapses_whitespace_and_trims_edges`, `parse_rejects_unclosed_group` (code `MARKUP_MALFORMED`), `parse_rejects_crossed_tags`.
  - `structure-check.test.ts`, source `Run <x1/> or <g1>read <x2/></g1>`: `accepts_reordered_words_around_atoms`, `rejects_lost_atom` (`PLACEHOLDER_LOST`), `rejects_duplicated_atom` (`PLACEHOLDER_DUPLICATED`), `rejects_lost_group_close` (`MARKUP_MALFORMED`), `rejects_atom_moved_out_of_its_group` (`STRUCTURE_MOVED`), `accepts_text_changes_inside_groups`.
  - `comment-marker.test.ts`: `splits_double_slash_comment` (`"// clone it"` gives prefix `"// "`, body `"clone it"`), `splits_block_comment_with_both_markers`, `keeps_hash_shebang_untouched_as_empty_body` (`"#!/bin/sh"` gives empty body), `roundtrip_prefix_body_suffix_is_identity`.
  - `block-translation.test.ts`: `textSlots_follows_depth_first_order`.
- [ ] **Step 2: Run** `bun test domain/markup domain/block`. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above. `parseMarkup` is a small tokenizer with a stack; `checkAgainstSource` builds a `key -> parentGroupKey` map for both trees and compares them. Both throw nothing.
- [ ] **Step 4: Run** the same command plus `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add inline model, placeholder markup and structure validation`.

---

### Task 4: Prompt adapters, batch format, budget and splitting

**Files:**
- Create: `domain/prompt/{prompt-version.ts, prompt-adapter.ts, translategemma-prompt.ts, instruction-prompt.ts}`, `domain/batch/{budget.ts, split.ts, batch-format.ts}`
- Test: mirrored

**Interfaces:**
- Consumes: `LanguageCode`, `PageBrief`, `InlineNode`, `toMarkup`.
- Produces:
  - `PROMPT_VERSION = "1"` (string const in `prompt-version.ts`; bumped by hand when any prompt text changes).
  - `type ModelFamily = "translategemma" | "instruction"`; `modelFamilyOf(model: string): ModelFamily` (prefix `translategemma` gives the first).
  - `interface ChatMessage { role: "system" | "user"; content: string }`.
  - `interface BatchSegment { n: number; markup: string }`.
  - `interface PromptInput { source: Option<LanguageCode>; target: LanguageCode; brief: PageBrief; segments: BatchSegment[] }`.
  - `interface PromptAdapter { build(input: PromptInput): ChatMessage[]; overheadTokens(input: Omit<PromptInput, "segments">): number }` with `const translateGemmaPrompt: PromptAdapter` and `const instructionPrompt: PromptAdapter` (stateless, so `const` objects, not classes).
  - `encodeBatch(segments: BatchSegment[]): string` giving `<seg n="1">markup</seg>` lines; `decodeBatch(response: string): Map<number, string>` tolerant of surrounding prose, code fences and a leading "Here is the translation:" line; only well formed `seg` wrappers are returned.
  - `estimateTokens(text: string): number` = `Math.ceil(text.length / 3)`; `maxInputTokens(contextTokens: number, overheadTokens: number): number` = `Math.floor((contextTokens - overheadTokens) / 2.3)` (input plus 1.3 times as much output plus overhead must fit).
  - `planBatches(segments: BatchSegment[], maxInputTokens: number, maxSegments: number): BatchSegment[][]`, order preserved, a segment never split across batches.
  - `splitNodes(nodes: InlineNode[], maxTokens: number): Result<InlineNode[][], { code: "SEGMENT_TOO_LONG" }>`: cuts only between sentences of top level text nodes (outside groups); `splitText(text: string, maxTokens: number): string[]`: sentence boundaries first, then whitespace, never inside a word unless a single word exceeds the budget.

- [ ] **Step 1: Failing tests.**
  - `translategemma-prompt.test.ts`: `produces_one_user_message_and_no_system` ; `uses_model_card_wording`, asserting the content starts with `You are a professional English (en) to French (fr) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to French grammar, vocabulary, and cultural sensitivities.` and contains `Produce only the French translation, without any additional explanations or commentary. Please translate the following English text into French:`; `states_tag_preservation_rule` (contains the instruction to keep every `<seg n>`, `<xN/>` and `<gN>` tag); `unknown_source_uses_generic_wording`; `includes_encoded_batch_after_the_instructions`. Language display names via `Intl.DisplayNames`. Before writing, run `ollama show translategemma:12b --template` once: expected output is a plain `user` turn wrapper, confirming a single message carries everything.
  - `instruction-prompt.test.ts`: `produces_system_then_user`, `system_contains_domain_brief_title_host_and_headings`, `system_tells_to_keep_jargon_and_return_exactly_the_segments`.
  - `batch-format.test.ts`: `decode_extracts_segments_from_noisy_output` (fences, intro line), `decode_ignores_unknown_and_unterminated_segments`, `decode_keeps_inner_tags_untouched`.
  - `budget.test.ts`: `estimateTokens("abc")_is_1`, `maxInputTokens(2048, 300)_is_760`, `planBatches_respects_budget_and_segment_cap`, `planBatches_preserves_order`.
  - `split.test.ts`: `splits_a_9000_char_paragraph_into_pieces_under_budget` (each `estimateTokens(toMarkup(piece)) <= max`, and concatenating pieces' markup equals the source markup), `never_cuts_inside_a_group_or_atom`, `giant_group_returns_SEGMENT_TOO_LONG`, `splitText_prefers_sentence_boundaries`, `splitText_hard_splits_a_word_longer_than_budget`.
- [ ] **Step 2: Run** `bun test domain/prompt domain/batch`. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures. Instruction prompt wording (system): domain inferred from brief, keep terms of art as a native professional of that field would (in French tech writing: fork, pull request, merge, commit stay English), keep tone, register, formatting and all tags, return only the `<seg>` list. Both adapters append `encodeBatch(...)` to the user message.
- [ ] **Step 4: Run** the same command plus `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add prompt adapters, batch format and context budgeting`.

---

### Task 5: Batch translation service and cache policy

**Files:**
- Create: `domain/cache/cache-key.ts`, `application/ports/{translation-provider.ts, translation-cache.ts, hasher.ts}`, `application/batch-translation.service.ts`
- Test: `application/batch-translation.service.test.ts`, `domain/cache/cache-key.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4.
- Produces:
  - Ports: `interface TranslationProvider { readonly id: string; readonly model: string; chat(messages: ChatMessage[], options: { contextTokens: number }): Promise<Result<string, ProviderError>> }`; `interface TranslationCache { getMany(keys: string[]): Promise<Map<string, string>>; setMany(entries: Map<string, string>): Promise<void> }` (infrastructure absorbs its own failures: a cache failure degrades to a miss, never an error); `interface Hasher { sha256Hex(input: string): Promise<string> }`.
  - `cacheKey(parts: { sourceMarkup: string; source: Option<LanguageCode>; target: LanguageCode; providerId: string; model: string; promptVersion: string }): string` returns the canonical string to hash (`"\u001f"` joined); `CacheKeyFactory` not needed.
  - `interface SegmentRequest { id: string; markup: string }`.
  - `interface BatchRequest { segments: SegmentRequest[]; source: Option<LanguageCode>; target: LanguageCode; brief: PageBrief; cachePolicy: CachePolicy }`.
  - `type SegmentFailureCode = MarkupErrorCode | "SEGMENT_TOO_LONG" | "RESPONSE_MISSING_SEGMENT"`.
  - `type SegmentOutcome = { id: string; status: "translated"; markup: string; fromCache: boolean } | { id: string; status: "failed"; code: SegmentFailureCode }`.
  - `class BatchTranslationService { constructor(deps: { provider: TranslationProvider; cache: TranslationCache; hasher: Hasher; prompt: PromptAdapter; contextTokens: number; maxSegmentsPerBatch: number }); translate(request: BatchRequest): Promise<Result<SegmentOutcome[], ProviderError>> }`.
- Behavior: read cache (skipped when `refresh`), split oversized segments with `splitNodes`/`maxInputTokens` and join the translated pieces with a single space, plan batches, call the provider, decode, `parseMarkup` plus `checkAgainstSource` on each segment, write only validated results to the cache (also on `refresh`, overwriting). A segment failing validation or missing from the response is retried once alone. A provider error fails the whole call with that error and writes nothing.

- [ ] **Step 1: Failing scenarios** (given / when / then, `mock()` ports from `bun:test`, no hand made spies; assertions on the returned outcomes and on what the cache received, not on call order):
  - `cache_hit_returns_cached_markup_and_makes_no_provider_call`.
  - `cache_miss_translates_validates_and_stores`.
  - `refresh_policy_ignores_cached_value_and_overwrites_it`.
  - `changing_prompt_version_or_model_or_target_is_a_cache_miss` (via `cacheKey` unit test).
  - `lost_placeholder_is_retried_alone_then_succeeds` (first response drops `<x1/>`, second is valid; outcome translated).
  - `lost_placeholder_twice_yields_failed_PLACEHOLDER_LOST_and_caches_nothing_for_it`.
  - `duplicated_placeholder_is_rejected`.
  - `group_moved_out_of_parent_is_failed_STRUCTURE_MOVED_after_one_retry`.
  - `oversized_segment_is_split_translated_in_pieces_and_joined_in_order` (9000 chars, context 2048: provider receives several calls each within `maxInputTokens`; outcome markup equals pieces joined).
  - `unsplittable_segment_is_failed_SEGMENT_TOO_LONG_without_provider_call`.
  - `missing_segment_in_response_is_retried_alone`.
  - `provider_forbidden_fails_the_whole_call_with_PROVIDER_FORBIDDEN_ORIGIN_and_writes_nothing`.
  - `segments_are_grouped_into_batches_under_the_context_budget` (assert the number of provider calls for a 40 segment request).
- [ ] **Step 2: Run** `bun test application domain/cache`. Expected: FAIL.
- [ ] **Step 3: Implement** `cacheKey` and `BatchTranslationService` with the signature above. Concurrency is not this class's concern (decorator in Task 6).
- [ ] **Step 4: Run** the same command plus `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add batch translation service with validation, retry and cache`.

---

### Task 6: Ollama provider, concurrency limit, hasher

**Files:**
- Create: `infrastructure/providers/{ollama-provider.ts, concurrency-limited-provider.ts}`, `infrastructure/hashing/sha256-hasher.ts`
- Test: mirrored `*.test.ts`

**Interfaces:**
- Consumes: `TranslationProvider`, `Hasher`, `providerError`.
- Produces:
  - `class OllamaProvider implements TranslationProvider { constructor(config: { baseUrl: string; model: string; fetch: typeof fetch; timeoutMs: number }) }`, `id = "ollama"`. `chat` POSTs `{baseUrl}/api/chat` with `{ model, messages, stream: false, keep_alive: "10m", options: { temperature: 0, num_ctx: contextTokens } }` and reads `message.content` (Zod parsed).
  - `class ConcurrencyLimitedProvider implements TranslationProvider { constructor(inner: TranslationProvider, limit: number) }`: FIFO semaphore; `id` and `model` forwarded.
  - `const sha256Hasher: Hasher` over `crypto.subtle`.
- Error mapping in `OllamaProvider`: network failure or `TypeError` gives `PROVIDER_UNREACHABLE`; HTTP 403 gives `PROVIDER_FORBIDDEN_ORIGIN` with message containing `OLLAMA_ORIGINS=chrome-extension://<id>` and `systemctl edit ollama`; HTTP 404 gives `PROVIDER_MODEL_MISSING` with `ollama pull <model>`; invalid JSON or missing `message.content` gives `PROVIDER_BAD_RESPONSE`; abort gives `PROVIDER_TIMEOUT`. The extension id is injected in the message by the caller through a `forbiddenHint: string` config field (Task 10), never read from `chrome` here.

- [ ] **Step 1: Failing tests** (fetch replaced by `mock()` returning `Response` objects):
  - `ollama-provider.test.ts`: `posts_native_chat_payload_with_num_ctx_and_zero_temperature`, `returns_message_content`, `maps_403_to_PROVIDER_FORBIDDEN_ORIGIN_with_the_systemd_fix_in_the_message`, `maps_connection_refused_to_PROVIDER_UNREACHABLE`, `maps_404_to_PROVIDER_MODEL_MISSING`, `maps_garbage_body_to_PROVIDER_BAD_RESPONSE`, `maps_abort_to_PROVIDER_TIMEOUT`, `does_not_retry_on_403`.
  - `concurrency-limited-provider.test.ts`: `never_runs_more_than_limit_calls_at_once` (limit 1, three calls, max observed concurrency 1, results in FIFO order), `releases_the_slot_when_the_inner_call_fails`.
  - `sha256-hasher.test.ts`: `matches_known_vector` (`"abc"` gives `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`).
- [ ] **Step 2: Run** `bun test infrastructure`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files. The provider catches everything and returns `Result.fail`; nothing throws.
- [ ] **Step 4: Run** the same command plus `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add ollama provider, concurrency limit and sha256 hasher`.

---

### Task 7: Translation queue and page translation service

**Files:**
- Create: `domain/queue/translation-queue.ts`, `application/ports/{page-surface.ts, batch-translator.ts, language-detector.ts}`, `application/page-translation.service.ts`
- Test: `domain/queue/translation-queue.test.ts`, `application/page-translation.service.test.ts`

**Interfaces:**
- Consumes: `Block`, `BlockTranslation`, `BlockId`, `shouldSkipBlock`, `textSlots`, `toMarkup`, `parseMarkup`, `SegmentOutcome`, `BatchRequest`.
- Produces:
  - `type ProximityRank = 0 | 1` (0 visible, 1 next screen).
  - `class TranslationQueue { enqueue(id: BlockId, rank: ProximityRank): void; drop(id: BlockId): void; take(max: number): BlockId[]; size(): number }`: lower rank first, FIFO within a rank, re-enqueue only upgrades a rank, `drop` of an absent id is a no-op, `take` removes what it returns.
  - Ports: `interface PageSurface { readBrief(): PageBrief; scan(): Block[]; watch(listener: SurfaceListener): () => void; commit(translation: BlockTranslation): Result<void, { code: "BLOCK_DETACHED" }>; show(view: "original" | "translated"): void }`, `interface SurfaceListener { onBlocks(blocks: Block[]): void; onProximity(id: BlockId, rank: Option<ProximityRank>): void }`.
  - `interface BatchTranslator { translate(request: BatchRequest): Promise<Result<SegmentOutcome[], ProviderError>> }`; `interface LanguageDetector { detect(text: string): Promise<Option<LanguageCode>> }`.
  - `type ViewState = { kind: "original" } | { kind: "translating" } | { kind: "translated" } | { kind: "error"; error: ProviderError }`.
  - `class PageTranslationService { constructor(deps: { surface: PageSurface; translator: BatchTranslator; detector: LanguageDetector; target: LanguageCode; maxSegmentsPerRequest: number }); toggle(): Promise<void>; retranslate(): Promise<void>; state(): ViewState; subscribe(listener: (state: ViewState) => void): () => void; whenIdle(): Promise<void> }`.
- Behavior: first `toggle` scans, starts `watch`, sets `translating`, pumps the queue one request at a time (`take(maxSegmentsPerRequest)`), commits translated outcomes (`structured` from `parseMarkup`), skips blocks for which `shouldSkipBlock` holds (detection through the port), becomes `translated` when the queue is empty and at least one request succeeded or all blocks were skipped. A block whose structured segment fails is retried as `text-slots` (one segment per text node, plain markup), and left original if that fails too. Later `toggle` calls flip `translated` and `original` through `surface.show` with zero translator calls. A `translated` page keeps pumping newly discovered blocks. `retranslate` shows original, forgets committed ids, re-enqueues every block that has a rank, and sends `cachePolicy: "refresh"`. A provider error stops the pump, sets `error`, leaves the page as it was, and does not retry; the next `toggle` from `error` starts again. `onProximity(id, none)` drops the block from the queue.

- [ ] **Step 1: Failing tests.**
  - `translation-queue.test.ts`: `visible_before_next_screen_regardless_of_insertion_order`, `fifo_within_a_rank`, `reenqueue_upgrades_but_never_downgrades`, `drop_removes_and_ignores_absent`, `take_removes_returned_ids`.
  - `page-translation.service.test.ts` (given / when / then, ports mocked by the runner, a fake in memory surface helper under `application/testing/` allowed only if it holds no logic beyond storing; assertions on state, committed translations and the translator's received requests):
    - `first_toggle_translates_visible_blocks_before_next_screen_blocks`.
    - `far_blocks_dropped_from_the_queue_are_never_sent`.
    - `second_toggle_shows_original_without_calling_the_translator`, `third_toggle_shows_translated_without_calling_the_translator`.
    - `page_already_in_target_language_makes_zero_translator_calls_and_ends_translated` (Review Focus 4); `mixed_page_sends_only_non_target_blocks`.
    - `short_block_in_target_language_is_still_sent`.
    - `failed_structured_segment_falls_back_to_text_slots` ; `failed_text_slots_leave_the_block_original_and_state_translated`.
    - `blocks_discovered_after_translation_are_translated_without_a_new_toggle`.
    - `retranslate_sends_refresh_policy_and_resends_all_ranked_blocks`.
    - `provider_forbidden_sets_error_state_with_the_error_and_stops_pumping`.
    - `toggle_from_error_retries`.
    - `request_never_exceeds_maxSegmentsPerRequest`.
- [ ] **Step 2: Run** `bun test domain/queue application/page-translation`. Expected: FAIL.
- [ ] **Step 3: Implement** the queue and the service. Source language for requests: `brief.sourceLanguage`, else the detector on the title plus first heading, else `Option.none()`.
- [ ] **Step 4: Run** the same command plus `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add priority queue and page translation service`.

---

### Task 8: DOM segmentation, protected nodes and fixtures (read side)

**Files:**
- Create: `infrastructure/dom/{block-reader.ts, protected-nodes.ts, page-brief-reader.ts}`
- Create: `packages/translation/fixtures/github-fork-a-repo.html`, `fixtures/spa-feed.html`, `fixtures/react-like-page.html`
- Test: mirrored; `packages/translation/test-setup/happy-dom.ts` registers happy-dom (`GlobalRegistrator`) and is passed to `bun test --preload` in the package `test` script (same for `apps/extension`, whose dev dependencies include `@types/chrome` 0.3.5)

**Interfaces:**
- Consumes: `Block`, `InlineNode`, `BlockId`, `splitCommentMarker`.
- Produces:
  - `isExcluded(el: Element): boolean` and `isProtectedInline(el: Element): boolean` in `protected-nodes.ts` (the Global Constraints list, plus inline `code`, `kbd`, `samp`, `var`, `img`, `br`, `svg`, `math`, and `a` whose trimmed text matches a URL or path pattern).
  - `interface ReadBlock { block: Block; scope: Node[]; atoms: Map<number, Node>; groups: Map<number, Element>; textNodes: Text[]; commentAffixes: Map<Text, { prefix: string; suffix: string }> }`.
  - `class BlockReader { constructor(doc: Document, ids: () => BlockId); read(root: ParentNode): ReadBlock[] }`: a block is a maximal run of sibling inline nodes under a parent, split by block level children (`p`, `li`, `h1` to `h6`, `td`, `th`, `dt`, `dd`, `blockquote`, `figcaption`, `summary`, `caption`, `div`, `section`, `ul`, `ol`, `table`, `tr` and the like); runs without a letter are ignored; a run is not re-read once seen (a `WeakSet` of scope heads). Highlighted comments inside `pre` (`.pl-c`, `.hljs-comment`, `.token.comment`, Shiki and CodeMirror comment classes) are read as one block each, text node body only (marker split off by `splitCommentMarker`); unhighlighted code produces no block.
  - `readPageBrief(doc: Document): PageBrief`: host, `<title>`, meta description, `h1` and first 5 headings (`h2`, `h3`), `documentElement.lang` as source language (`Option`).

- [ ] **Step 1: Capture the GitHub fixture.** In Chrome open `https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-forks`, run via the Chrome `javascript_tool` (or DevTools console): clone `document.documentElement`, remove every `script`, `iframe`, `link[rel=preload|modulepreload|prefetch]` and tracking `img`, rewrite relative `href`/`src` of `link[rel=stylesheet]` to absolute URLs, serialize with `outerHTML`, save to `packages/translation/fixtures/github-fork-a-repo.html` (target under 400 KB). The page must contain at least one fenced `pre` with highlighted comments and several inline `code` and `kbd` elements; if not, pick the "Fork a repository" page instead. Add a header line in the README fixtures section: GitHub docs content is CC BY 4.0, source URL and capture date. Write `spa-feed.html`: an empty `<main id="feed">` plus an inline script appending an `<article><h2>` and `<p>` with inline `<code>` every call of `window.__append(n)`, and removing the oldest one when asked by `window.__trim()`. Write `react-like-page.html`: a static tree plus a tiny inline script `window.__frame` that stores references to every text node of `#app` and exposes `rerender()` which calls `parent.removeChild(textNode)` then `parent.appendChild(newTextNode)` on the stored references, mimicking keyed reconciliation.
- [ ] **Step 2: Failing tests on the GitHub fixture** (`block-reader.test.ts`, document loaded into happy-dom):
  - `finds_headings_paragraphs_and_list_items` (the `h1` text is a block; number of blocks above 20).
  - `no_block_scope_is_inside_pre_code_kbd_samp_or_svg`.
  - `inline_code_becomes_an_atom_and_its_node_is_the_original_node` (for a paragraph containing `<code>`, the `atoms` map value is `===` the live element).
  - `link_whose_text_is_a_url_is_an_atom_and_ordinary_link_is_a_group`.
  - `translate_no_and_notranslate_are_excluded`.
  - `highlighted_comment_in_pre_is_a_block_with_marker_split_and_plain_code_is_not`.
  - `second_read_of_the_same_root_returns_no_duplicates`.
  - `read_does_not_mutate_the_document` (serialized `documentElement.outerHTML` identical before and after).
  - `page_brief_has_title_h1_and_html_lang`.
- [ ] **Step 3: Run** `bun test infrastructure/dom`. Expected: FAIL.
- [ ] **Step 4: Implement** the three files. happy-dom chosen over linkedom: it implements `TreeWalker`, `MutationObserver`, `Range` and `getBoundingClientRect` stubs that Tasks 8 and 9 need, linkedom does not implement `MutationObserver`.
- [ ] **Step 5: Run** the same command plus `pnpm verify`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(translation): add dom block reader, protected nodes and fixtures`.

---

### Task 9: DOM surface, in place patching, exact restore and watching (write side)

**Files:**
- Create: `infrastructure/dom/{dom-page-surface.ts, block-watcher.ts}`
- Test: `dom-page-surface.test.ts`, `block-watcher.test.ts`

**Interfaces:**
- Consumes: `BlockReader`, `ReadBlock`, `PageSurface`, `SurfaceListener`, `BlockTranslation`, `ProximityRank`.
- Produces: `class DomPageSurface implements PageSurface { constructor(deps: { doc: Document; window: Window; ids: () => BlockId; observers?: WatcherPorts }) }` and `class BlockWatcher` (internal).
- Patch algorithm (the part the signature does not fix): never detach or replace an original node. For a `structured` translation, per container (the block scope, then each group element): rewrite original text nodes' `data` in order from the translated text pieces (surplus original text nodes get empty data and stay attached; extra pieces create new text nodes inserted next to the last one), and reorder children of the same parent with `insertBefore` using the translated order. Groups and atoms never change parent. For `text-slots`, write `texts[i]` into the i-th original text node. Comment blocks write `prefix + translated + suffix`. Before the first patch of a block, snapshot per container the ordered child list and each text node's original `data`. `show("original")` restores snapshots, `show("translated")` re-applies the stored translated child order and data, both without calling the translator and without creating new elements. A block whose scope head is no longer connected is dropped silently (`BLOCK_DETACHED`).
- `BlockWatcher`: `MutationObserver` on `body` (childList, subtree, characterData ignored; mutations made by the surface itself are skipped via a `suppress` flag around patching) feeding `BlockReader.read` on added subtrees, debounced to one animation frame; `IntersectionObserver` with `rootMargin` of one viewport height top and bottom emitting `onProximity(id, some(0))` when the block rect intersects the viewport, `some(1)` when only inside the margin, `none` when it leaves; observes the scope head element (or its parent for a text-only run).

- [ ] **Step 1: Failing tests** (happy-dom, fixtures from Task 8; observers injected as fakes through `WatcherPorts` so no layout engine is needed):
  - `commit_translated_then_show_original_restores_outerHTML_byte_for_byte` (GitHub fixture, many blocks committed with changed text and reordered groups; `documentElement.outerHTML` equal to the pre-translation snapshot).
  - `protected_nodes_are_byte_identical_after_translation_and_after_toggle_back` (collect `outerHTML` of every `pre`, `code`, `kbd`, `samp`, `svg` before; equal after commit and after `show("original")`; for highlighted comments only the comment text node differs after commit).
  - `toggle_twice_is_idempotent_and_makes_no_new_elements` (element count constant).
  - `framework_removeChild_on_original_text_node_does_not_throw` (Review Focus 1, `react-like-page.html`: commit a translation, call `window.__frame.rerender()`: no exception, then `show("original")` restores the original text of nodes still attached).
  - `original_text_nodes_keep_identity` (node `===` before and after for all text nodes in blocks).
  - `reordered_groups_stay_under_the_same_parent`.
  - `block_removed_from_dom_before_commit_returns_BLOCK_DETACHED_and_does_not_throw`.
  - `watcher_reports_blocks_added_after_start` (SPA fixture: `__append(3)` yields three blocks once, `__trim()` then proximity none or no throw).
  - `surface_own_mutations_do_not_retrigger_scanning` (commit of 10 blocks yields zero additional `onBlocks` calls).
  - `proximity_rank_zero_for_visible_one_for_margin_none_when_far` (fake observer entries).
- [ ] **Step 2: Run** `bun test infrastructure/dom`. Expected: FAIL.
- [ ] **Step 3: Implement** both files following the algorithm above.
- [ ] **Step 4: Run** the same command plus `pnpm verify` (including jscpd on the two reader files). Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add in place dom patching, exact restore and block watcher`.

---

### Task 10: Extension composition root, worker, content script, commands

**Files:**
- Create: `apps/extension/{package.json,tsconfig.json,wxt.config.ts}`, `src/permissions.ts`, `src/config/runtime-config.ts`, `src/messaging/{translate-batch.contract.ts,toggle.contract.ts}`, `src/adapters/chrome/{storage-translation-cache.ts,chrome-language-detector.ts,runtime-batch-translator.ts}`, `src/composition/{background.ts,content.ts}`, `entrypoints/{background.ts,content.ts}`, `scripts/serve-fixtures.ts`
- Test: `runtime-config.test.ts`, `translate-batch.contract.test.ts`, `storage-translation-cache.test.ts`, `runtime-batch-translator.test.ts`, `chrome-language-detector.test.ts`

**Interfaces:**
- Consumes: `BatchTranslationService`, `OllamaProvider`, `ConcurrencyLimitedProvider`, `sha256Hasher`, `translateGemmaPrompt`, `instructionPrompt`, `modelFamilyOf`, `PageTranslationService`, `DomPageSurface`.
- Produces:
  - `permissions.ts`: `PAGE_MATCHES = ["<all_urls>"]`, `PROVIDER_HOSTS = ["http://localhost:11434/*", "http://127.0.0.1:11434/*"]`, the only place where host access is declared; `wxt.config.ts` reads it for `content_scripts.matches` and `host_permissions`, adds permissions `storage`, `unlimitedStorage`, an `action`, a command `toggle-translation` (suggested `Alt+L`), a fixed `key` so the extension id is stable (generate once with `openssl genrsa 2048 | openssl rsa -pubout -outform DER | base64 -w0`, commit the public part only; the id derived from it is printed in the README), and `allFrames: process.env.LAMBE_ALL_FRAMES === "1"` for the content script (proof only).
  - `RuntimeConfig` Zod schema and `loadRuntimeConfig(storage): Promise<RuntimeConfig>` with defaults `{ provider: { kind: "ollama", baseUrl: "http://localhost:11434", model: "translategemma:12b", concurrency: 1, timeoutMs: 120000 }, target: <chrome.i18n.getUILanguage() primary subtag, "en" if unknown>, contextTokens: 2048 for translategemma else 8192, maxSegmentsPerBatch: 8, maxSegmentsPerRequest: 12 }`, read from `chrome.storage.local` key `lambe:config` (a partial object merged over defaults; invalid content falls back to defaults).
  - `translate-batch.contract.ts`: Zod schemas for the request message `{ type: "lambe/translate-batch"; payload: BatchRequest-dto }` and the response `{ ok: true; outcomes } | { ok: false; error: ProviderError }`, with `toBatchRequestDto`/`fromBatchRequestDto` mapping value objects to strings (`.value` out, `X.create` in); `toggle.contract.ts`: `{ type: "lambe/toggle" }`.
  - `StorageTranslationCache implements TranslationCache` over a minimal `StorageAreaLike { get(keys: string[]): Promise<Record<string, unknown>>; set(items: Record<string, string>): Promise<void> }`, keys `tc:<hash>`, values Zod-checked strings, any storage error returns an empty map or a no-op (absorbed).
  - `ChromeLanguageDetector implements LanguageDetector` over `chrome.i18n.detectLanguage`; returns `Option.none()` unless `isReliable`. If `chrome.i18n.detectLanguage` is undefined in the content script, route it through a `lambe/detect-language` message handled by the worker (decide when running Step 5).
  - `RuntimeBatchTranslator implements BatchTranslator` over `chrome.runtime.sendMessage`, validating the response with the contract.

- [ ] **Step 1: Failing tests.**
  - `runtime-config.test.ts`: `defaults_when_storage_is_empty`, `partial_override_is_merged`, `invalid_config_falls_back_to_defaults`, `context_tokens_follow_model_family`.
  - `translate-batch.contract.test.ts`: `request_dto_roundtrips_language_codes_and_policy`, `rejects_unknown_message_type`, `error_response_keeps_code_and_message`.
  - `storage-translation-cache.test.ts` (fake `StorageAreaLike`): `set_then_get_roundtrip`, `get_of_unknown_keys_returns_only_hits`, `storage_failure_returns_empty_map_and_does_not_throw`.
  - `runtime-batch-translator.test.ts`: `returns_outcomes_on_ok_response`, `maps_error_response_to_failure`, `maps_malformed_response_to_PROVIDER_BAD_RESPONSE`.
  - `chrome-language-detector.test.ts`: `unreliable_detection_is_none`, `reliable_detection_maps_to_language_code`.
- [ ] **Step 2: Run** `cd apps/extension && bun test`. Expected: FAIL.
- [ ] **Step 3: Implement** the adapters, contracts and config. Composition roots are explicit constructors, no scan: `composition/background.ts` builds config, provider (`OllamaProvider` wrapped in `ConcurrencyLimitedProvider`, `forbiddenHint` containing the real `chrome.runtime.id`), cache, `BatchTranslationService`, registers `chrome.runtime.onMessage` for `lambe/translate-batch`, and `chrome.action.onClicked` plus `chrome.commands.onCommand` sending `lambe/toggle` to the active tab; `composition/content.ts` builds `DomPageSurface`, `PageTranslationService` and listens for `lambe/toggle`. `entrypoints/*.ts` only call these functions. `scripts/serve-fixtures.ts` is a `Bun.serve` static server on port 4173 for `packages/translation/fixtures/` and `apps/extension/proof/`.
- [ ] **Step 4: Build.** `pnpm --filter @lambe/extension build`. Expected: `.output/chrome-mv3/manifest.json` exists, content script and worker bundled, manifest has the three host entries, the command and the `key`.
- [ ] **Step 5: Smoke test in Chrome.** Load `.output/chrome-mv3` unpacked, open `http://localhost:4173/spa-feed.html`, press `Alt+L`. Expected: with Ollama up and `OLLAMA_ORIGINS` set, content changes; check the service worker console for errors. Fix detector routing here if needed.
- [ ] **Step 6: Run** `pnpm verify`. Expected: PASS (knip must see the WXT entrypoints; add them to the `apps/extension` workspace `entry` in `knip.json`).
- [ ] **Step 7: Commit** `feat(extension): wire worker, content script, commands and chrome adapters`.

---

### Task 11: Shadow DOM bubble

**Files:**
- Create: `apps/extension/src/bubble/{placement.ts, click-classifier.ts, bubble-state.ts, bubble-view.ts, bubble.css}`, `src/bubble/bubble-view.test.ts` and mirrored tests for the three pure files
- Modify: `src/composition/content.ts` to mount the bubble through WXT `createShadowRootUi` (open shadow root, `position: fixed`, top frame only) and bind it to `PageTranslationService`

**Interfaces:**
- Consumes: `ViewState`, `PageTranslationService`, `ProviderError`, `assets/tengwa-lambe.svg` (imported with `?raw`, path data extracted once into the view).
- Produces:
  - `placement.ts`: `snapSide(centerX: number, viewportWidth: number): "left" | "right"` (left when `centerX < viewportWidth / 2`), `clampTop(top: number, viewportHeight: number, size: number): number` (min 40, max `viewportHeight - size - 6`), `restingLeft(side, viewportWidth, size, margin = 4): number`.
  - `click-classifier.ts`: `createClickClassifier(scheduler: { set(cb: () => void, ms: number): number; clear(id: number): void }, handlers: { onSingle(): void; onDouble(): void }, windowMs = 250): { pointerUp(): void }`: a second `pointerUp` inside the window cancels the pending single and calls `onDouble`; otherwise `onSingle` fires after the window.
  - `bubble-state.ts`: `bubbleStateOf(state: ViewState): { classes: ("on" | "busy" | "error")[]; tooltip: Option<string> }`.
  - `bubble-view.ts`: `mountBubble(root: ShadowRoot, handlers: { onSingle(): void; onDouble(): void }): { render(state: ViewState): void; destroy(): void }`. Pointer handling follows the mockup: `pointerdown` starts a possible drag (moves under 4 px are clicks), `pointermove` toggles the `left` class live by `snapSide`, `pointerup` after a drag snaps to the side keeping a clamped `top`, otherwise feeds the classifier. States: idle shows "Aa" at about 55 % opacity; `translating` dashes run and glyph pulses; `translated` glyph glows `#7ee0c3`; `error` uses a distinct stroke color token and a tooltip. All colors and sizes are CSS custom properties declared in `bubble.css`; no inline style except the dynamic `left` and `top` set through CSS variables.
- Menu (right click) is out of scope here and arrives in Plan 2.

- [ ] **Step 1: Failing tests.**
  - `placement.test.ts`: `snaps_left_when_center_is_in_left_half`, `snaps_right_otherwise`, `clamps_top_between_40_and_height_minus_size_minus_6`.
  - `click-classifier.test.ts` (manual scheduler fake): `single_click_fires_after_250ms`, `two_clicks_within_250ms_fire_only_double`, `two_clicks_far_apart_fire_two_singles`.
  - `bubble-state.test.ts`: `translating_is_busy`, `translated_is_on`, `error_has_tooltip_with_code_message` and `forbidden_tooltip_contains_OLLAMA_ORIGINS_and_systemctl_edit_ollama` (Review Focus 5, message text comes from the `ProviderError`).
  - `bubble-view.test.ts` (happy-dom): `render_applies_state_classes_to_the_host_button`, `tail_class_flips_with_side`, `destroy_removes_listeners_and_nodes`, `bubble_is_a_real_button_element_with_an_accessible_name`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/bubble`. Expected: FAIL.
- [ ] **Step 3: Implement** the files. The bubble is plain DOM, not React, deliberately: it ships in every page's content script and the logic is the mockup's. It is an element created once, never re-rendered.
- [ ] **Step 4: Run** the same command plus `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): add draggable snapping bubble in shadow dom`.

---

### Task 12: Real browser proof, README, release automation

**Files:**
- Create: `apps/extension/proof/proof.html`, `README.md`, `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/ci.yml`
- Modify: `packages/translation/fixtures/*` only if the proof exposes a fixture bug (then add the test first)

**Interfaces:**
- Consumes: the whole system built with `LAMBE_ALL_FRAMES=1 pnpm --filter @lambe/extension build`.
- `proof.html`: three same origin `<iframe>` elements titled by width, `width` 390, 768 and 1440 px, each `src="/github-fork-a-repo.html"`, laid out in a scrolling row (Hyprland: `resize_window` does not work, so widths come from iframes).
- README sections: what it is, requirements, `pnpm install`, build and load unpacked, the extension id derived from the manifest `key`, the Ollama fix, how to set a config override in the service worker console (`chrome.storage.local.set({"lambe:config": { target: "fr" }})`), fixtures licence note, scripts, release flow. Ollama fix text, verbatim: `sudo systemctl edit ollama`, then add `[Service]` and `Environment="OLLAMA_ORIGINS=chrome-extension://<id>"`, save, `sudo systemctl restart ollama`.
- Release: `release-please-config.json` with a `node` release type at the root package, `bump-minor-pre-major: true`, no manual version anywhere; `.release-please-manifest.json` `{ ".": "0.0.0" }`; CI workflow runs `pnpm install --frozen-lockfile` and `pnpm verify`; a release workflow using a GitHub App token (`BOT_CLIENT_ID`, `BOT_PRIVATE_KEY`) is added but only documented in the README until a remote exists.

- [ ] **Step 1: Build and serve.** `LAMBE_ALL_FRAMES=1 pnpm --filter @lambe/extension build`, then run `bun apps/extension/scripts/serve-fixtures.ts` in the background. Load `.output/chrome-mv3` unpacked in Chrome. Expected: `http://localhost:4173/proof.html` shows three frames and a bubble in each.
- [ ] **Step 2: Error proof first.** With `OLLAMA_ORIGINS` not yet set for this extension id, click the bubble in the 1440 px frame. Expected: bubble error state, tooltip containing `OLLAMA_ORIGINS=chrome-extension://<id>`, page untouched, one request only (use `read_network_requests`, no retry loop). Then apply the documented systemd override and restart Ollama.
- [ ] **Step 3: Translation proof.** Click the bubble in each frame. Using the Chrome `javascript_tool` on each `iframe.contentDocument`, record and report:
  - the translated `h1` and first two paragraphs;
  - `fork` and `pull request` kept as is, and absence of `fourchette` in the first 10 paragraphs;
  - every `pre`, `code`, `kbd` `outerHTML` hash equal before and after (except highlighted comments, which are translated);
  - time to first translated paragraph and time for the visible screen (`performance.now()` around the bubble click);
  - that scrolling down translates the next blocks and that blocks far below are not requested (`read_network_requests` count on `/api/chat` grows with scrolling).
- [ ] **Step 4: Toggle and double click proof.** Single click: original restored, `documentElement.outerHTML` equals the pre-translation capture, zero requests to `:11434`, latency under 100 ms. Single click again: translated restored, zero requests. Double click: a new request batch appears and the cache entry is overwritten.
- [ ] **Step 5: Bubble proof.** At 390, 768 and 1440 px: drag the bubble to the opposite edge, it snaps, tail flips, stays inside the frame and stays clickable (screenshots of each width).
- [ ] **Step 6: Console.** `read_console_messages` on the proof page: no errors from the host page or the content script; service worker console clean except expected provider errors during Step 2.
- [ ] **Step 7: Record the result.** Fill a short "Plan 1 verification" section in the README with the measured numbers above. If a measurement fails, fix the cause with a test in the owning task's file first, then redo the step; do not weaken the check.
- [ ] **Step 8: Run** `pnpm verify`. Expected: PASS, full output attached to the report.
- [ ] **Step 9: Commit** `docs: add README, proof page and release automation` (one commit; open the PR from `feat/page-translation` to `dev`).

---

## Self-review notes

- Coverage: 6.1 (tasks 7, 9, 10, 12), 6.2 (11, 12), 7.1 (3, 8, 9), 7.2 brief (2, 4, 8; glossary deferred to Plan 2), 7.3 (4), 8 (4 to 7, 10; OpenAI compatible deferred to Plan 2, settings UI deferred), 13 (1, 2 and every task's verify step), 11 hard checks (9, 12).
- Deferred on purpose and listed in the roadmap: settings UI, glossary, prompt editor and reset, OpenAI compatible provider, bubble menu, per site flags, cache size and clear, bubble position persistence.
- Open risks: TranslateGemma may not preserve `<xN/>` and `<gN>` tags reliably (fallback to text slots is built in; the Step 3 proof of Task 12 measures how often it triggers); `chrome.i18n.detectLanguage` availability in content scripts; TypeScript 7 with dependency-cruiser needs the pinned package extension; happy-dom has no layout so visibility is only proven in the browser step.
