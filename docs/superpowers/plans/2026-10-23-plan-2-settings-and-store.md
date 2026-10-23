# Lambë Plan 2: settings, providers, FR/EN and store readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The extension is production ready and Chrome Web Store ready: narrow permissions granted at click time, a polished React settings page with onboarding consent, an OpenAI-compatible provider next to Ollama, the whole UI in English and French, store listing, privacy policy and assets.

**Architecture:** A typed, versioned settings store in `chrome.storage.local` replaces the console-only override behind the same `loadRuntimeConfig` seam; every context reacts to `chrome.storage.onChanged`. The manifest keeps only localhost host permissions; the page script is injected on demand with `activeTab` or registered dynamically (`chrome.scripting.registerContentScripts`) after the user grants origins from the settings page. The translation package gains an OpenAI-compatible adapter, a model catalog port, a connection check and an editable prompt guidelines block; the app gains an `options` entrypoint (React 19, Vite, Tailwind 4 for layout, shadcn, tokens in global CSS) and an i18n catalog (`@wxt-dev/i18n`, `en` and `fr`).

**Tech Stack:** as Plan 1 and 3 (TypeScript 7.0.2, Bun 1.4.3, WXT 0.21.4, Zod 4.6.7, happy-dom 21.0.3, Biome 2.5.15, knip, jscpd, dependency-cruiser). New, pinned exact in the task that adds them (latest release at least 2 weeks old, checked with `pnpm view`): `@wxt-dev/i18n`, `@wxt-dev/module-react`, `react`, `react-dom` (19), `tailwindcss` and `@tailwindcss/vite` (4), shadcn runtime deps (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`).

**Spec:** `docs/superpowers/specs/2026-10-18-lambe-design.md` sections 10, 12, 13, the store permission note (line 113) and the constraints lines 8 and 31. Roadmap: `docs/superpowers/plans/2026-10-18-roadmap.md` (Plan 2). Conventions and engine as built: `2026-10-18-plan-1-page-translation.md`, `2026-10-23-plan-3-youtube-captions.md` and the merged code.

## Decisions

1. **Permissions.** Options: keep `<all_urls>` and justify it to the store, or narrow. Choice: narrow. `permissions` = `storage`, `unlimitedStorage`, `activeTab`, `scripting`, `contextMenus`; `host_permissions` = `http://localhost/*`, `http://127.0.0.1/*` (default Ollama, any port); `optional_host_permissions` = `https://*/*`, `http://*/*`; no static content script. Why: a broad host permission means a slow in-depth review and a scary install prompt; the bubble on every site becomes a user choice. Dev and store manifests are identical except `key`. Switch: none.
2. **Page script delivery.** Options: static content script (needs host access), or on demand. Choice: toolbar click and `Alt+L` use `activeTab`: the worker pings the tab, injects the page script with `chrome.scripting.executeScript` (files from the build, entrypoint declared `registration: "runtime"`) when nobody answers, then toggles. "Show the bubble on every site" requests the two optional origins at click time then `registerContentScripts` (id `lambe-page`, `persistAcrossSessions`); removal unregisters. "YouTube captions" requests `https://www.youtube.com/*` and registers `lambe-youtube-main` (MAIN, `document_start`) and `lambe-youtube` (isolated, `document_idle`, with its emitted CSS). A single pure `desiredRegistrations(settings, granted)` plus an idempotent `reconcile` drives all of it, called on install, startup, settings change, `permissions.onAdded` and `permissions.onRemoved`. Why: one code path, self healing when the user revokes a permission in `chrome://extensions`. Switch: none.
3. **Per site auto translate.** Needs the origin permission and the page script on that origin. Options: ask from the content script (it has no `chrome.permissions`), ask from the worker (no user gesture), ask from an extension page. Choice: the bubble menu opens the options page on the Sites section with the origin prefilled and a confirm `Button`; the click calls `permissions.request` then saves the rule; `reconcile` registers `lambe-site:<origin>` with the page script. Why: the gesture must live in an extension page. Switch: if a later Chrome lets the worker request on a message gesture, point the menu to it.
4. **Settings UI stack.** WXT `entrypoints/options/` (React 19, Vite, Tailwind 4 for layout only, shadcn, tokens in the global CSS), `options_ui.open_in_tab: true`, opened on install. Alternative: plain DOM like the bubble; rejected, the spec asks React and shadcn. Sections: Provider, Translation, Sites, YouTube, Prompt, Cache, Shortcut, Privacy and about. Each section is `<name>-section.tsx` plus a framework free `<name>-model.ts` that carries the logic and the tests.
5. **Onboarding and consent.** First open shows a welcome with the data disclosure and a consent `Button`; `consentAt` is stored. Before consent the worker refuses every translate request (`CONSENT_REQUIRED`, provider never called) and the toolbar, command and bubble open the options page instead (Chrome Web Store 2026 user data policy). Withdraw consent in the Privacy section. Switch: none.
6. **Settings store.** Typed Zod schema, `version: 1`, one key `lambe:settings` in `chrome.storage.local` behind `SettingsStore`; a migration table keyed by version. Invalid or newer-version stored settings: contexts run on defaults, the stored value is left untouched until the user saves, and the options page shows a banner with the issues and "Reset to defaults" / "Keep and fix". Engine tunables (`contextTokens`, batch sizes, caption windows) leave the user facing config and become constants in `toRuntimeConfig`; the README "Configuration override" section goes.
7. **API key.** Options: inside settings, a separate key, `storage.session`, or served by the worker only. Choice: key `lambe:secrets` in `storage.local`, read only by the worker and the options page, never logged, never in error messages or `onChanged` payload handling of other contexts. Accepted limit: a content script could technically read the area (isolated world, not reachable from page JS). Switch: serve non secret settings to content scripts through a worker port and set the area access level to trusted contexts.
8. **Providers.** Options: one adapter with a flag, or a second adapter. Choice: `OpenAiCompatibleProvider` (`POST {base}/v1/chat/completions`, SSE stream, `Authorization: Bearer`, `GET {base}/v1/models`) beside `OllamaProvider`, same `TranslationProvider` port, same `ProviderError` codes (plus `PROVIDER_UNAUTHORIZED`), wrapped by the same `AdaptiveConcurrencyProvider`. A new `ModelCatalog` port lists models for both (`/api/tags` for Ollama). `ProviderError` and `CaptionError` gain optional `params` so the UI renders `code` + `params` through the catalog while `message` stays English for logs. Saving a non local base URL requests that origin first.
9. **Editable prompt.** Options: let the user edit the whole prompt, or only the guidelines. Choice: guidelines only. The engine critical parts (tag rule, `[N]` line format, caption line rule) stay fixed so validation keeps working. `DEFAULT_GUIDELINES` replaces the current `JARGON_RULE` and tone lines for pages; the cache key uses `promptVersionOf(brief, guidelinesId)` where `guidelinesId` is `""` for the default and the first 12 hex chars of the sha256 of the text otherwise, so default keys do not change and edits invalidate only themselves. The Prompt section shows `PROMPT_VERSION` and a diff marker when customized.
10. **i18n.** `@wxt-dev/i18n` module, `locales/en.yml` (default) and `locales/fr.yml`, typed keys from the generated structure, UI follows `chrome.i18n.getUILanguage()`, `__MSG_` for manifest name, description, action title and command description. A parity test fails when `fr` misses or adds a key, or a placeholder differs. Errors: `renderError({ code, params })` maps to `error.<code>` keys. Missing French falls back to English at runtime. Switch: none.
11. **Debug logging.** `debug` setting gates every `console.debug` and info level log through one `logger`; warnings and errors stay on.
12. **Out of scope.** Glossary (spec 10), the companion URL and status (Plan 4), the eval harness (Plan 5), the companion URL in settings, analytics, remote config, other store locales than `en` and `fr`.

## Global Constraints

- Chrome, Manifest V3. Provider requests leave from the background worker (translation) or the options page (connection test and model list) only, never from a content script.
- Spec constraint kept: content script and bubble on every page are now opt in, declared in one place (`desiredRegistrations`), as the spec asked before any store release.
- Repo rules: `Result` and `Option` from `@lambe/kernel`, typed error codes, no comments or JSDoc, no `as X`, no `!`, guard clauses and early return, no barrel `index.ts`, domain folders, tests mirrored as `*.test.ts` in snake case stating behaviour, `bun test`, Biome, knip, jscpd at 0, dependency-cruiser layers (`domain`, `application`, `infrastructure`).
- React UI: shadcn `Button`, `Input`, `Select` (never raw `<button>`, `<input>`, `<select>`), minimal markup, props as `interface`, no inline styles, no design in components, colors and spacing through tokens in the global CSS, Tailwind for layout only, `void navigate(...)`-style fire and forget in callbacks. Every frontend task starts by invoking the skill `frontend-design:frontend-design` inside the shadcn plus tokens frame.
- No em dash, en dash or spaced hyphen as punctuation anywhere (code, docs, UI, locales).
- Git: branch `feat/store-ready` from `dev`, Conventional Commits, one commit per task, stage file by file, never `--no-verify`, no push.
- Every task ends with `pnpm verify` green (Biome, type check, tests, knip, jscpd, dependency-cruiser) and its commit.
- A user visible string is a catalog key from Task 4 on; Task 9 and the options tasks never add a literal.

## Review Focus

1. Stored settings that fail validation or come from a newer version. Expected: defaults at runtime, stored value untouched, banner in the options page. Pinned in Task 3 (`invalid_stored_settings_are_reported_not_dropped`, `settings_from_a_newer_version_are_not_overwritten`).
2. A translate request before consent, or after consent withdrawn. Expected: refused with `CONSENT_REQUIRED`, zero provider calls, the toolbar opens the options page. Pinned in Task 6 (`click_before_consent_opens_the_options_page`) and Task 8 (`translate_before_consent_never_calls_the_provider`).
3. The user revokes a host permission in `chrome://extensions` while a script is registered. Expected: registration removed, setting shown as off, nothing throws. Pinned in Task 7 (`removed_permission_unregisters_its_scripts`, `reconcile_is_idempotent`).
4. Toolbar click on a page the extension cannot script (`chrome://`, Web Store, PDF viewer) or on a tab where the page script already lives. Expected: a clear unavailable state and no throw; never a second bubble. Pinned in Task 6 (`restricted_page_reports_instead_of_throwing`, `present_page_script_is_toggled_not_reinjected`).
5. OpenAI-compatible base URL typed with a trailing slash or already ending in `/v1`, and an API key. Expected: one `/v1/chat/completions` URL, the key never appears in a message, log or error. Pinned in Task 1 (`base_url_with_v1_suffix_is_not_doubled`, `api_key_never_appears_in_error_messages`).

## File Structure

```
packages/translation/src/
  domain/provider/{provider-error.ts, origins-fix.ts}          (modify / create)
  domain/caption/caption-error.ts                               (modify: params)
  domain/prompt/{guidelines.ts, prompt-version.ts, translategemma-prompt.ts, instruction-prompt.ts}
  application/ports/model-catalog.ts
  application/provider-check.service.ts
  application/batch-translation.service.ts                      (modify: guidelinesId)
  infrastructure/providers/{openai-compatible-provider.ts, ollama-provider.ts}
apps/extension/
  wxt.config.ts  package.json  scripts/check-manifest-key.ts
  locales/{en.yml, fr.yml}
  entrypoints/{content.ts, youtube.content.ts, youtube-timedtext.content.ts, background.ts}   (runtime registration)
  entrypoints/options/{index.html, main.tsx, options.css}
  src/settings/{settings.ts, settings-store.ts, secrets-store.ts, migrations.ts, site-rule.ts}
  src/config/runtime-config.ts
  src/i18n/{t.ts, render-error.ts}
  src/activation/{activate-tab.ts, consent-gate.ts}
  src/access/{registrations.ts, host-access.ts, script-registrar.ts, reconcile.ts}
  src/logging/logger.ts
  src/bubble/{bubble-menu.ts, bubble-menu.css}                  (+ bubble-view.ts, strings)
  src/options/{app.tsx, use-settings.ts, onboarding.tsx, components/ui/*}
  src/options/sections/{provider,translation,sites,youtube,prompt,cache,shortcut,privacy}-section.tsx + *-model.ts
  src/composition/{background,content,youtube}.ts              (modify)
  proof/stub-provider.ts  scripts/render-promo.ts
docs/{privacy-policy.md, store/listing.en.md, store/listing.fr.md, store/assets/*}
LICENSE  README.md  README.fr.md
```

## Parallel plan

- Group A, disjoint files: Tasks 1, 2, 3, 4 (only Task 4 touches `wxt.config.ts`).
- Group B: Task 5 (after 3 and 4).
- Group C after 5: Tasks 6, 7, 9, 11 (new directories each; `background.ts` wiring lines and `wxt.config.ts`/`package.json` for Task 11 are the only shared lines, settled by a raccord pass after merge).
- Task 8 after 6 and 7; Task 10 after 8 and 9.
- Group F after 10 and 11: Tasks 12, 13, 14 (one section each; `locales/*.yml` is the only shared file, each task owns its `options.<section>.*` group, raccord pass after merge).
- Group G after F: Tasks 15 and 16. Then 17, then 18.

---

### Task 1: Provider errors with params, OpenAI-compatible adapter, model catalog

**Files:**
- Create: `packages/translation/src/application/ports/model-catalog.ts`, `application/provider-check.service.ts` (+ test), `domain/provider/origins-fix.ts` (+ test), `infrastructure/providers/openai-compatible-provider.ts` (+ test)
- Modify: `domain/provider/provider-error.ts`, `domain/caption/caption-error.ts`, `infrastructure/providers/ollama-provider.ts` (+ test), `packages/translation/package.json` exports

**Interfaces:**
- Produces:
  - `ProviderError { code; message; params?: Record<string, string> }`, `providerError(code, message, params?)`; new code `PROVIDER_UNAUTHORIZED`. `CaptionError` gains the same optional `params`. Ollama errors fill `baseUrl`, `model`, `origin` (`forbiddenHint`), `status`, `timeoutMs`.
  - `interface ModelCatalog { listModels(signal?: AbortSignal): Promise<Result<string[], ProviderError>> }`, implemented by both providers.
  - `class OpenAiCompatibleProvider implements TranslationProvider, ModelCatalog`, config `{ baseUrl; model; apiKey: Option<string>; fetch; timeoutMs; now: () => number }`. Stream stats: `promptTokens` and `outputTokens` from the final `usage` chunk (`stream_options: { include_usage: true }`), `totalMs` measured with `now`, other fields 0.
  - `class ProviderCheckService { constructor(deps: { catalog: ModelCatalog }); check(model: string, signal?: AbortSignal): Promise<Result<ConnectionReport, ProviderError>> }`, `interface ConnectionReport { models: string[]; modelInstalled: boolean }`.
  - `ollamaOriginsFix(extensionId: string): OriginsFix[]` with `interface OriginsFix { os: "linux" | "macos" | "windows"; origin: string; steps: { kind: "command" | "note"; text: string }[] }`. Origin is `chrome-extension://<id>`. Linux: `sudo systemctl edit ollama`, add `Environment="OLLAMA_ORIGINS=<origin>"` under `[Service]`, `sudo systemctl restart ollama`. macOS: `launchctl setenv OLLAMA_ORIGINS "<origin>"`, then quit and reopen the Ollama app. Windows: `setx OLLAMA_ORIGINS "<origin>"`, then quit Ollama from the tray and start it again.

- [ ] **Step 1: Failing tests.**
  - `openai-compatible-provider.test.ts`: `streams_sse_deltas_and_finishes_on_done`, `sends_bearer_key_only_when_configured`, `base_url_with_v1_suffix_is_not_doubled`, `trailing_slash_base_url_is_normalized`, `401_maps_to_provider_unauthorized`, `404_maps_to_model_missing`, `unreachable_host_maps_to_provider_unreachable`, `idle_stream_times_out`, `abort_signal_maps_to_request_cancelled`, `usage_chunk_becomes_generation_stats`, `lists_models_from_v1_models`, `api_key_never_appears_in_error_messages`.
  - `ollama-provider.test.ts`: `lists_models_from_api_tags`, `forbidden_error_carries_origin_param`.
  - `provider-check.service.test.ts`: `reports_installed_model`, `reports_missing_model_with_the_installed_list`, `passes_the_provider_failure_through`.
  - `origins-fix.test.ts`: `linux_fix_names_systemd_and_the_exact_origin`, `macos_fix_uses_launchctl_setenv`, `windows_fix_uses_setx`, `every_os_is_returned_once`.
- [ ] **Step 2: Run** `cd packages/translation && bun test src/infrastructure/providers src/application/provider-check src/domain/provider`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** the signatures above. Share the chunk read loop, idle timer and abort helpers with the Ollama adapter by extracting them to `infrastructure/providers/stream-support.ts` (jscpd must stay at 0). Add the three exports the app needs (`openai-compatible-provider`, `provider-check.service`, `origins-fix`, `model-catalog`) to `package.json`.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): add an openai compatible provider and a connection check`.

---

### Task 2: Editable prompt guidelines

**Files:**
- Create: `domain/prompt/guidelines.ts` (+ test)
- Modify: `domain/prompt/{prompt-adapter.ts, prompt-version.ts, translategemma-prompt.ts, instruction-prompt.ts}` and tests, `application/batch-translation.service.ts` (+ test), `packages/translation/package.json` exports

**Interfaces:**
- Produces:
  - `DEFAULT_GUIDELINES: string` (the current `JARGON_RULE` for translategemma; `JARGON_RULE` plus `TONE_RULE` for instruction models, merged into one shared text so both adapters read the same block) and `guidelinesIdOf(text: string, hash: Hasher): Promise<string>` returning `""` when `text` is empty or equals `DEFAULT_GUIDELINES`, else the first 12 hex chars of its sha256.
  - `PromptInput` gains `guidelines: string` (empty means default); `promptVersionOf(brief: ContentBrief, guidelinesId: string): string` returns `PROMPT_VERSION` or `CAPTION_PROMPT_VERSION`, suffixed `+<guidelinesId>` when not empty. Caption briefs ignore guidelines.
  - `BatchTranslationService` deps gain `guidelines: string`; its cache key uses `promptVersionOf(brief, guidelinesId)`.

- [ ] **Step 1: Failing tests.** `guidelines.test.ts`: `empty_text_has_no_id`, `default_text_has_no_id`, `custom_text_has_a_stable_twelve_char_id`. Prompt tests: `custom_guidelines_replace_the_default_block`, `tag_rule_stays_when_guidelines_are_customized`, `caption_prompt_ignores_guidelines`. Batch: `default_guidelines_keep_existing_cache_keys`, `custom_guidelines_change_only_their_own_keys`.
- [ ] **Step 2: Run** `cd packages/translation && bun test src/domain/prompt src/application/batch-translation.service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Export `guidelines` and `prompt-version` for the app.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(translation): make the prompt guidelines editable and versioned in the cache key`.

---

### Task 3: Settings schema, store and migration

**Files:**
- Create: `apps/extension/src/settings/{settings.ts, settings-store.ts, secrets-store.ts, migrations.ts, site-rule.ts}` and tests
- Modify: `src/config/runtime-config.ts` (+ test), callers of `loadRuntimeConfig` in `src/composition/{background,content,youtube}.ts` (signature only)

**Interfaces:**
- Produces:
  - `Settings` (Zod, `version: 1`): `consentAt: number | undefined`, `provider: { kind: "ollama" | "openai-compatible"; baseUrl: string; model: string; concurrency: number; timeoutMs: number }`, `target: string` (a `LanguageCode` value), `bubbleEverywhere: boolean`, `youtube: boolean`, `sites: SiteRule[]` (`{ origin: string; autoTranslate: boolean; hideBubble: boolean }`, origin is `scheme://host`), `prompt: string`, `debug: boolean`. `defaultSettings(uiLanguage: string): Settings` (Ollama `http://localhost:11434`, `translategemma:12b`, concurrency 8, timeout 120000, target from the UI language else `en`, toggles false).
  - `interface SettingsArea { get(keys: string[]): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void>; onChanged: { addListener(l: (changes: Record<string, { newValue?: unknown }>) => void): void; removeListener(l: ...): void } }`.
  - `interface SettingsProblem { code: "SETTINGS_INVALID" | "SETTINGS_FROM_NEWER_VERSION"; issues: string[] }`; `interface LoadedSettings { settings: Settings; problem: Option<SettingsProblem> }`.
  - `class SettingsStore { constructor(area: SettingsArea, uiLanguage: string); load(): Promise<LoadedSettings>; save(next: Settings): Promise<void>; update(change: (current: Settings) => Settings): Promise<void>; subscribe(listener: (loaded: LoadedSettings) => void): () => void }`; `save` and `update` refuse to write while a problem is open unless `save` is called with the full valid object (the "Keep and fix" path).
  - `class SecretsStore { constructor(area); apiKey(): Promise<Option<string>>; setApiKey(key: string): Promise<void>; clear(): Promise<void> }` on key `lambe:secrets`.
  - `siteRuleOf(sites: SiteRule[], origin: string): SiteRule` (default `{ origin, autoTranslate: false, hideBubble: false }`), `withSiteRule(sites, rule): SiteRule[]` (remove when both flags are false).
  - `loadRuntimeConfig(store: SettingsStore, uiLanguage: string): Promise<RuntimeConfig>`: `RuntimeConfig` keeps its shape (engine tunables become constants, `contextTokens` from the model family), plus `provider.kind`, `guidelines`, `debug`.

- [ ] **Step 1: Failing tests.** `settings.test.ts`: `defaults_follow_the_browser_ui_language`, `unknown_ui_language_falls_back_to_english`, `rejects_a_provider_base_url_that_is_not_http`. `settings-store.test.ts`: `missing_settings_load_as_defaults_without_a_problem`, `invalid_stored_settings_are_reported_not_dropped`, `settings_from_a_newer_version_are_not_overwritten`, `update_merges_and_persists`, `subscribe_fires_on_storage_changes_from_other_contexts`, `unsubscribe_stops_notifications`, `v0_shaped_legacy_override_is_migrated` (the old `lambe:config` target and provider are carried into `lambe:settings` once). `secrets-store.test.ts`: `api_key_round_trips`, `clear_removes_the_key`. `site-rule.test.ts`: `unknown_origin_gets_the_default_rule`, `rule_with_both_flags_off_is_removed`. `runtime-config.test.ts`: existing cases rewritten on a settings fixture plus `contexts_tokens_follow_the_model_family`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/settings src/config`. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures; `migrations.ts` is a `Record<number, (raw: unknown) => unknown>` applied in order, with a version above 1 producing `SETTINGS_FROM_NEWER_VERSION`.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): store typed versioned settings behind the config port`.

---

### Task 4: i18n foundation, manifest messages, error catalog

**Files:**
- Create: `apps/extension/locales/{en.yml, fr.yml}`, `src/i18n/{t.ts, render-error.ts}` and tests
- Modify: `apps/extension/wxt.config.ts` (module `@wxt-dev/i18n/module`, `default_locale: "en"`, `name`, `description`, action title and command description as `__MSG_*__`), `package.json`

**Interfaces:**
- Produces:
  - Keys (flat, dotted groups): `ext.name`, `ext.description`, `ext.actionTitle`, `ext.commandToggle`, `error.<CODE>` for every `ProviderErrorCode`, `CaptionError` code and the app codes `CONSENT_REQUIRED`, `PAGE_UNAVAILABLE`, `SETTINGS_INVALID`, `SETTINGS_FROM_NEWER_VERSION`, `common.*` (save, cancel, reset, remove, copy, learnMore). Error texts take their `params` (`{baseUrl}`, `{model}`, `{origin}`, `{status}`, `{timeoutMs}`) and are actionable ("Ollama is not reachable at {baseUrl}. Start it, then try again.").
  - `t(key: MessageKey, ...substitutions: string[]): string` a thin typed wrapper over the generated `i18n.t`; `renderError(error: { code: string; params?: Record<string, string> }): string` orders params by the placeholder order declared in the catalog and falls back to `error.UNKNOWN`.

- [ ] **Step 1: Failing tests.** `catalog.test.ts` (reads both yml files): `fr_has_exactly_the_keys_of_en`, `placeholders_match_between_en_and_fr`, `every_error_code_has_a_message`, `no_message_contains_a_dash_used_as_punctuation`. `render-error.test.ts`: `fills_params_in_catalog_order`, `unknown_code_uses_the_generic_message`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/i18n locales`. Expected: FAIL.
- [ ] **Step 3: Implement.** Check the module's current docs (Context7 `/websites/wxt_dev`, page `wxt.dev/i18n`): yml in `locales/`, plural and substitution syntax, generated structure type. Build and open the unpacked manifest to confirm `_locales/en/messages.json` and `fr` exist.
- [ ] **Step 4: Run** `pnpm verify` and `pnpm --filter @lambe/extension build`. Expected: PASS, manifest has `default_locale: "en"`.
- [ ] **Step 5: Commit** `feat(extension): add english and french catalogs for the manifest and errors`.

---

### Task 5: Narrow manifest and runtime registered entrypoints

**Files:**
- Modify: `apps/extension/wxt.config.ts`, `src/permissions.ts`, `entrypoints/{content.ts, youtube.content.ts, youtube-timedtext.content.ts}`, `scripts/check-manifest-key.ts`, `.github/workflows/release.yml` (drop nothing, the guard now passes; remove the "Store releases are blocked" paragraph in Task 16)
- Test: `src/permissions.test.ts`

**Interfaces:**
- Produces: in `permissions.ts`: `LOCAL_HOSTS = ["http://localhost/*", "http://127.0.0.1/*"]`, `OPTIONAL_HOSTS = ["https://*/*", "http://*/*"]`, `YOUTUBE_MATCHES` unchanged, `PAGE_SCRIPT = "/content-scripts/content.js"`, `YOUTUBE_SCRIPT`, `YOUTUBE_MAIN_SCRIPT`, `YOUTUBE_CSS` (exact emitted paths, read from the WXT typed `ScriptPublicPath`). Every content entrypoint declares `registration: "runtime"`. The `build:manifestGenerated` hook and `PAGE_MATCHES`, `PROVIDER_HOSTS` and `LAMBE_ALL_FRAMES` rewrite go away (frames: the page script runs in the top frame only, `allFrames: false` in every registration).
- `check-manifest-key.ts` now: fails when `content_scripts` is not empty or absent; `permissions` is not exactly the 5 above; `host_permissions` is not exactly `LOCAL_HOSTS`; `optional_host_permissions` is not exactly `OPTIONAL_HOSTS`; `default_locale` is not `en`; `name` does not start with `__MSG_`; the store build has a `key`; the dev build lacks one. The MAIN world rule moves to Task 7 (dynamic).

- [ ] **Step 1: Failing test.** `permissions.test.ts`: `script_paths_exist_in_the_wxt_public_path_type` (a `satisfies ScriptPublicPath` compile check plus string equality), `local_hosts_have_no_port`. Failing build check: run `pnpm --filter @lambe/extension build && pnpm --filter @lambe/extension check:manifest` with the new rules before the config change. Expected: FAIL.
- [ ] **Step 2: Implement** the manifest (`permissions`, `host_permissions`, `optional_host_permissions`, no `content_scripts`), the entrypoint options and the guard. Confirm the build emits the three scripts and `youtube.css` at the exported paths.
- [ ] **Step 3: Run** `pnpm verify`, dev build plus `check:manifest`, then `LAMBE_STORE=1` build plus `check:manifest`. Expected: PASS both, store manifest without `key`.
- [ ] **Step 4: Commit** `feat(extension): drop static host access and register content scripts at runtime`.

---

### Task 6: Activation with activeTab and the consent gate

**Files:**
- Create: `src/activation/{activate-tab.ts, consent-gate.ts}` and tests
- Modify: `src/composition/background.ts` (wiring), `src/messaging/toggle.contract.ts` (ping message)

**Interfaces:**
- Consumes: `PAGE_SCRIPT`, `SettingsStore`, `TOGGLE_MESSAGE`.
- Produces:
  - `interface TabScripting { sendMessage(tabId: number, message: unknown): Promise<unknown>; injectFiles(tabId: number, files: string[]): Promise<void> }`.
  - `type ActivationOutcome = "toggled" | "injected" | "needs-consent" | "unavailable"`; `activateTab(deps: { tabs: TabScripting; settings: SettingsStore; openOptions(): Promise<void> }, tabId: number): Promise<ActivationOutcome>`: no `consentAt` opens the options page and returns `needs-consent`; otherwise `sendMessage(TOGGLE_MESSAGE)`; on "Receiving end does not exist" inject `PAGE_SCRIPT` then send again; any injection failure returns `unavailable`.
  - `showUnavailable(action: { setBadgeText; setTitle }, tabId: number): void` sets badge `!` and the localized title for 3 s on `unavailable`.
  - `chrome.runtime.onInstalled` with `reason === "install"` opens the options page.

- [ ] **Step 1: Failing tests.** `activate-tab.test.ts`: `click_before_consent_opens_the_options_page`, `present_page_script_is_toggled_not_reinjected`, `missing_page_script_is_injected_then_toggled`, `restricted_page_reports_instead_of_throwing`, `second_click_after_injection_does_not_inject_again`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/activation`. Expected: FAIL.
- [ ] **Step 3: Implement** with the real adapters in `background.ts` (`chrome.tabs.sendMessage`, `chrome.scripting.executeScript({ target: { tabId }, files })`); toolbar click and `Alt+L` both call `activateTab`. Add `ext.unavailableTitle` to both catalogs.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): activate the page script with activeTab and gate on consent`.

---

### Task 7: Host access, script registrations and reconcile

**Files:**
- Create: `src/access/{registrations.ts, host-access.ts, script-registrar.ts, reconcile.ts}` and tests
- Modify: `src/composition/background.ts` (listeners)

**Interfaces:**
- Consumes: `Settings`, `PAGE_SCRIPT`, `YOUTUBE_*`, `OPTIONAL_HOSTS`, `YOUTUBE_MATCHES`.
- Produces:
  - `interface Registration { id: string; js: string[]; css: string[]; matches: string[]; world: "ISOLATED" | "MAIN"; runAt: "document_start" | "document_idle"; allFrames: false; persistAcrossSessions: true }`.
  - `desiredRegistrations(settings: Settings, granted: string[]): Registration[]` pure: `lambe-page` on `OPTIONAL_HOSTS` when `bubbleEverywhere` and both are granted; `lambe-youtube-main` (MAIN, `document_start`) plus `lambe-youtube` (isolated, `document_idle`, css) on `YOUTUBE_MATCHES` when `youtube` and granted; `lambe-site:<origin>` on `<origin>/*` for every rule with `autoTranslate` or `hideBubble` whose origin is granted and not already covered by `lambe-page`.
  - `interface HostAccess { granted(): Promise<string[]>; request(origins: string[]): Promise<boolean>; remove(origins: string[]): Promise<boolean> }` over `chrome.permissions`; `request` is only called from extension pages.
  - `interface ScriptRegistrar { registered(): Promise<Registration[]>; register(r: Registration[]): Promise<void>; unregister(ids: string[]): Promise<void> }` over `chrome.scripting`.
  - `reconcile(deps: { settings: SettingsStore; access: HostAccess; registrar: ScriptRegistrar }): Promise<void>`: diffs desired against registered by id and content, registers the missing, updates the changed, unregisters the extra, and never throws on an already registered or already removed id. Triggered on `onInstalled`, `onStartup`, settings change, `permissions.onAdded` and `permissions.onRemoved`.

- [ ] **Step 1: Failing tests.** `registrations.test.ts`: `page_script_needs_both_optional_origins`, `youtube_registers_main_at_document_start_and_isolated_at_idle`, `main_world_scripts_only_match_youtube`, `site_rule_registers_the_page_script_for_its_origin_only_when_granted`, `site_rule_is_skipped_when_the_page_script_covers_every_site`, `nothing_is_registered_without_settings_or_grants`. `reconcile.test.ts`: `reconcile_is_idempotent`, `removed_permission_unregisters_its_scripts`, `changed_registration_is_replaced`, `already_registered_id_does_not_throw`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/access`. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures and wire the five triggers in `background.ts`.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): register content scripts from settings and granted origins`.

---

### Task 8: Reactive contexts, consent gate in the worker, per site rules in pages

**Files:**
- Modify: `src/composition/{background,content,youtube}.ts`, `src/messaging/translate-batch.contract.ts` and `translate-batch.handler.ts` (+ tests), `src/adapters/chrome/port-batch-translator.ts` if the new code needs a case
- Test: `src/composition/*.test.ts` new where the logic is extractable (`worker-host.ts`, `page-rules.ts` created beside)

**Interfaces:**
- Consumes: `SettingsStore`, `SecretsStore`, providers, `siteRuleOf`, `guidelinesIdOf`.
- Produces:
  - `class WorkerHost { constructor(deps: { settings: SettingsStore; secrets: SecretsStore; build(config: RuntimeConfig, apiKey: Option<string>): Worker }); service(): Promise<Result<BatchTranslationService, AppError>> }`: rebuilds lazily after any settings or secrets change, builds the Ollama or OpenAI-compatible provider by `provider.kind`, applies guidelines and the debug flag; returns `CONSENT_REQUIRED` while `consentAt` is unset.
  - The translate contract's error codes gain `CONSENT_REQUIRED`.
  - `pageRulesFor(settings: Settings, origin: string): { hideBubble: boolean; autoTranslate: boolean; target: LanguageCode }`.
  - The page script subscribes to settings: a new target applies to the next translation without reload; `hideBubble` removes or shows the bubble live; `autoTranslate` toggles once after load when consent is given and the page language differs from the target.

- [ ] **Step 1: Failing tests.** `worker-host.test.ts`: `translate_before_consent_never_calls_the_provider`, `settings_change_rebuilds_the_provider_for_the_next_request`, `openai_kind_builds_the_openai_adapter_with_the_stored_key`, `api_key_change_rebuilds_the_provider`. `translate-batch.handler.test.ts`: `consent_required_travels_the_port_as_a_typed_error`. `page-rules.test.ts`: `hide_bubble_rule_applies_to_its_origin_only`, `auto_translate_requires_consent`, `target_change_applies_to_the_next_translation_without_reload`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/composition src/messaging`. Expected: FAIL.
- [ ] **Step 3: Implement.** The YouTube composition reads its target from the same subscription.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): react to settings changes in the worker and the pages`.

---

### Task 9: Runtime strings through the catalog

**Files:**
- Modify: `src/bubble/{bubble-view.ts, bubble-view.test.ts}`, `src/youtube/{player-button.ts, caption-overlay.ts}` + tests, `src/composition/{content,youtube}.ts` (console messages stay English logs), `locales/{en.yml, fr.yml}` (groups `bubble.*`, `youtube.*`)

**Interfaces:**
- Consumes: `t`, `renderError`. Produces: keys `bubble.translate`, `bubble.original`, `bubble.translating`, `bubble.retry`, `bubble.dragHint`, `bubble.errorTitle`, `youtube.button`, `youtube.buttonOn`, `youtube.noCaptions`, `youtube.translating`, plus the error states rendered by `renderError`. Views take a `translate: (key: MessageKey) => string` dependency so tests inject a fake and stay framework free.

- [ ] **Step 1: Failing tests.** `bubble-view.test.ts`: `labels_come_from_the_injected_catalog`, `error_state_renders_the_code_through_render_error`. `player-button.test.ts`: `button_label_and_title_follow_the_catalog`. `caption-overlay.test.ts`: `pending_caption_state_text_comes_from_the_catalog`. A grep test (`no_literal_ui_strings.test.ts`) fails when a string literal passes to `textContent`, `aria-label`, `title` or `setAttribute("title"` in `src/bubble` or `src/youtube`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/bubble src/youtube`. Expected: FAIL.
- [ ] **Step 3: Implement** and fill the French texts (tutoiement off, neutral imperative: "Traduire la page").
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): render the bubble and the youtube button through the catalog`.

---

### Task 10: Bubble right click menu

**Files:**
- Create: `src/bubble/{bubble-menu.ts, bubble-menu.css, bubble-menu.test.ts}`
- Modify: `src/bubble/bubble-view.ts` (contextmenu opens it), `src/composition/content.ts`, `src/messaging/` (new `open-options.contract.ts`), `src/composition/background.ts` (handler), `locales/*.yml` (`menu.*`)

**Interfaces:**
- Produces: `mountBubbleMenu(shadow: ShadowRoot, actions: MenuActions, translate: (key: MessageKey) => string): BubbleMenu` with `interface MenuActions { translateTo(language: LanguageCode): void; autoTranslateSite(): void; hideOnSite(): void; openSettings(): void }`, `open(anchor: DOMRect, state: { origin: string; siteRule: SiteRule; languages: LanguageCode[] }): void`, `close(): void`, `destroy(): void`. Plain DOM in the shadow root like the bubble (no React); items are real `button` elements by exception of the shadow DOM (shadcn does not apply there), keyboard accessible (arrows, Escape, Enter), closes on outside click. Language entry is a short list (target, `en`, `fr`, and the 6 most used among the stored recent choices) plus "More languages" opening settings.
  - `translateTo` restores the page then translates with a page scoped target (not saved). `hideOnSite` saves `hideBubble: true` for the origin and removes the bubble. `autoTranslateSite` sends `lambe/open-options` with `{ section: "sites", origin }`; the worker opens `options.html#sites?origin=<origin>` (Decision 3). `openSettings` opens the options page.

- [ ] **Step 1: Failing tests.** `bubble-menu.test.ts`: `right_click_opens_the_menu_without_the_page_context_menu`, `escape_closes_and_returns_focus_to_the_bubble`, `arrow_keys_move_between_items`, `outside_click_closes`, `hide_on_site_saves_the_rule_and_closes`, `translate_to_uses_a_page_scoped_target`, `auto_translate_asks_the_worker_to_open_the_sites_section`, `labels_come_from_the_catalog`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/bubble`. Expected: FAIL.
- [ ] **Step 3: Implement.** Menu keeps clear of viewport edges (`placement.ts` reuse); styling through the existing bubble CSS tokens.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): add the bubble context menu`.

---

### Task 11: Options shell, tokens, shadcn and onboarding

Start by invoking the skill `frontend-design:frontend-design` within the shadcn plus tokens frame: calm, utilitarian, dark and light, the lambë glyph as the only ornament.

**Files:**
- Create: `entrypoints/options/{index.html, main.tsx, options.css}`, `src/options/{app.tsx, use-settings.ts, onboarding.tsx, section-nav.tsx}`, `src/options/components/ui/{button,input,select,switch,card,badge,alert,textarea,command}.tsx` (copied from shadcn, modified last), tests
- Modify: `wxt.config.ts` (`@wxt-dev/module-react`, `@tailwindcss/vite`), `package.json`, `knip.json`, `tsconfig` for JSX, `locales/*.yml` (`options.shell.*`, `onboarding.*`)

**Interfaces:**
- Produces:
  - `index.html` with `<meta name="manifest.open_in_tab" content="true">`.
  - `useSettings(): { loaded: LoadedSettings; save(next: Settings): Promise<void>; update(change): Promise<void>; secrets: SecretsStore }` subscribing to the store; `<SettingsProvider>`.
  - `<App />`: hash router for the 8 sections (`#provider`, `#translation`, `#sites`, `#youtube`, `#prompt`, `#cache`, `#shortcut`, `#privacy`), sidebar on 768 px and up, top select below. Invalid settings render `<Alert>` with the issues and the two actions (Task 3 semantics).
  - `<Onboarding />`: shown while `consentAt` is unset; states what is sent and where ("The text of the pages you translate and the captions of YouTube videos are sent to the provider you configure, and nowhere else. Nothing goes to the developer. No analytics."), and one consent `Button`; all other sections stay reachable but translation stays blocked (Decision 5).
  - Tokens: one `:root` block (light) and a dark block in `options.css`, semantic names (`--background`, `--foreground`, `--muted`, `--border`, `--primary`, `--ring`, radius, font), shared with the bubble where it makes sense.

- [ ] **Step 1: Failing tests.** `onboarding.test.tsx` (react-dom plus happy-dom): `translation_stays_blocked_until_the_consent_button_is_clicked`, `consent_click_stores_consent_at_and_hides_the_welcome`. `use-settings.test.tsx`: `reflects_changes_made_in_another_context`. `section-model.test.ts`: `hash_selects_the_section`, `unknown_hash_selects_provider`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/options`. Expected: FAIL.
- [ ] **Step 3: Implement.** Raw `<button>`, `<input>`, `<select>` are forbidden: a Biome rule or the grep test `no_raw_form_elements_in_options` enforces it on `src/options` outside `components/ui`.
- [ ] **Step 4: Run** `pnpm verify`, then `pnpm --filter @lambe/extension build` and open `options.html` once to see the shell. Expected: PASS, no console error.
- [ ] **Step 5: Commit** `feat(extension): add the options page shell with onboarding consent`.

---

### Task 12: Provider section

Start with `frontend-design:frontend-design`. Files and tests below; the section reuses Task 11 components only.

**Files:**
- Create: `src/options/sections/provider-{section.tsx, model.ts, model.test.ts}`
- Modify: `locales/*.yml` (`options.provider.*`)

**Interfaces:**
- Consumes: `ProviderCheckService`, `OpenAiCompatibleProvider`, `OllamaProvider`, `ollamaOriginsFix`, `HostAccess`, `SecretsStore`, `renderError`.
- Produces: `providerModel(deps)` with `kind`, `baseUrl`, `model`, `apiKey` drafts, `testConnection(): Promise<ConnectionView>` and `save(): Promise<SaveResult>`. `ConnectionView` is `{ kind: "ok"; models: string[]; modelInstalled: boolean } | { kind: "error"; error: ProviderError; fix: OriginsFix[] }` where `fix` is filled only for `PROVIDER_FORBIDDEN_ORIGIN` using `chrome.runtime.id`. UI: kind `Select`, base URL `Input`, model `Select` fed by the fetched list with a free text fallback, API key `Input` (password) shown for OpenAI-compatible only, "Test connection" `Button`, result `Alert`; on 403 the three OS fixes in tabs with copy buttons; unreachable shows the base URL and a start hint.

- [ ] **Step 1: Failing tests.** `provider-model.test.ts`: `test_connection_lists_models_and_flags_a_missing_one`, `forbidden_origin_returns_fixes_for_the_three_systems_with_the_runtime_id`, `unreachable_error_carries_the_base_url`, `unauthorized_error_hints_the_api_key`, `saving_a_non_local_base_url_requests_its_origin_first`, `denied_origin_prompt_keeps_the_old_provider`, `api_key_is_saved_to_secrets_not_to_settings`, `switching_kind_resets_the_model_and_default_base_url`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/options/sections/provider`. Expected: FAIL.
- [ ] **Step 3: Implement.** Origin pattern for the request is `<scheme>://<host>/*`, never wider.
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): add the provider settings with a connection test`.

---

### Task 13: Translation, Sites and YouTube sections

Start with `frontend-design:frontend-design`.

**Files:**
- Create: `src/options/sections/{translation,sites,youtube}-{section.tsx,model.ts,model.test.ts}`, `src/options/languages.ts` (+ test)
- Modify: `locales/*.yml` (`options.translation.*`, `options.sites.*`, `options.youtube.*`)

**Interfaces:**
- Consumes: `HostAccess`, `SettingsStore`, `siteRuleOf`, `withSiteRule`, `OPTIONAL_HOSTS`, `YOUTUBE_MATCHES`.
- Produces:
  - `languageOptions(uiLanguage: string): { code: string; label: string }[]` using `Intl.DisplayNames` in the UI language, sorted by label, with `searchLanguages(options, query)` folding case and diacritics; the picker is a shadcn `Command` in a popover.
  - `sitesModel`: `setBubbleEverywhere(on)` requests `OPTIONAL_HOSTS` then saves, off saves then removes the origins only when no site rule needs them; `rules()`; `addSite(origin)` requests `<origin>/*` then saves; `setRule`, `removeRule` (removes the site permission when no flag stays set). Reads `#sites?origin=` to prefill a pending card with a confirm `Button` (Decision 3).
  - `youtubeModel.setEnabled(on)` requests `YOUTUBE_MATCHES` then saves; off saves then removes.
  - Every toggle shows its permission state when Chrome revoked it behind the back (setting on, grant missing: `Badge` "permission missing" and a re-grant `Button`).

- [ ] **Step 1: Failing tests.** `languages.test.ts`: `labels_follow_the_ui_language`, `search_ignores_case_and_diacritics`, `default_target_comes_from_the_browser_language`. `sites-model.test.ts`: `bubble_everywhere_is_saved_only_after_the_grant`, `denied_grant_leaves_the_setting_off`, `turning_it_off_keeps_origins_a_site_rule_still_needs`, `pending_origin_from_the_menu_is_prefilled`, `removing_the_last_flag_removes_the_rule_and_its_permission`, `revoked_permission_is_reported_not_hidden`. `youtube-model.test.ts`: `enabling_requests_the_youtube_origin_then_saves`, `denied_grant_leaves_it_off`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/options`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): add target language, sites and youtube settings`.

---

### Task 14: Prompt, Cache, Shortcut and Privacy sections

Start with `frontend-design:frontend-design`.

**Files:**
- Create: `src/options/sections/{prompt,cache,shortcut,privacy}-{section.tsx,model.ts,model.test.ts}`
- Modify: `src/adapters/chrome/storage-translation-cache.ts` (+ test: `size()`, `clear()`), `locales/*.yml` (`options.prompt.*`, `options.cache.*`, `options.shortcut.*`, `options.privacy.*`)

**Interfaces:**
- Produces:
  - `StorageTranslationCache.size(): Promise<{ entries: number; bytes: number }>` (`getBytesInUse` plus a key count restricted to cache keys) and `clear(): Promise<void>` that removes only cache keys, never settings or secrets.
  - `promptModel`: `text()` (stored or `DEFAULT_GUIDELINES`), `save(text)`, `reset()`, `isCustom()`, `version()` returning `PROMPT_VERSION` and the `guidelinesId`; a `Textarea`, "Reset to default" `Button`, a note that editing starts a fresh cache for that text.
  - `shortcutModel.current(): Promise<string>` from `chrome.commands.getAll()` (`toggle-translation`), empty shows "Not set", plus a `Button` opening `chrome://extensions/shortcuts` through `chrome.tabs.create`.
  - `privacyModel`: version from `chrome.runtime.getManifest()`, the data disclosure text, a link to `docs/privacy-policy.md` hosted on the repository, consent state with a "Withdraw consent" `Button` (sets `consentAt` to undefined).

- [ ] **Step 1: Failing tests.** `storage-translation-cache.test.ts`: `size_counts_only_cache_entries`, `clear_keeps_settings_and_secrets`. `prompt-model.test.ts`: `shows_the_default_text_until_customized`, `save_changes_the_guidelines_id`, `reset_restores_the_default_and_clears_the_id`, `identical_to_default_is_stored_as_empty`. `shortcut-model.test.ts`: `reads_the_binding_of_the_toggle_command`, `unset_binding_reads_as_empty`. `privacy-model.test.ts`: `withdrawing_consent_clears_consent_at`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/options src/adapters`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): add prompt, cache, shortcut and privacy settings`.

---

### Task 15: Production hygiene

**Files:**
- Create: `src/logging/logger.ts` (+ test), `LICENSE` (MIT, `Lambë contributors`, year 2026), `docs/privacy-policy.md`
- Modify: every `console.debug`, info and stats log in `src/composition/*.ts`, `src/adapters/**`, `src/messaging/**`; `apps/extension/package.json` (`"zip": "LAMBE_STORE=1 wxt zip -b chrome"`), root `package.json` (`"zip": "pnpm --filter @lambe/extension zip"`), `release-please-config.json` untouched

**Interfaces:**
- Produces: `createLogger(settings: { current(): Settings }): Logger` with `debug(...)` and `info(...)` silent unless `settings.debug`, `warn` and `error` always on, no method ever receives the API key (the logger rejects objects with a `apiKey` field in tests). `docs/privacy-policy.md` in English and French sections: data processed (page text and YouTube captions; stored locally: settings, cache, optional API key), sent only to the provider the user configured, nothing to the developer, local cache, no analytics, no remote code, deletion by uninstalling or clearing the cache, contact, and the Limited Use statement ("The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements").

- [ ] **Step 1: Failing tests.** `logger.test.ts`: `debug_is_silent_by_default`, `debug_follows_the_setting_live`, `warnings_and_errors_always_log`, `a_payload_with_an_api_key_field_is_redacted`.
- [ ] **Step 2: Run** `cd apps/extension && bun test src/logging`. Expected: FAIL.
- [ ] **Step 3: Implement**, then `rg "console\.(debug|info|log)" apps packages` returns only `logger.ts`.
- [ ] **Step 4: Run** `pnpm verify` and `pnpm zip`. Expected: PASS, `apps/extension/.output/*-chrome-store.zip` exists and `LAMBE_STORE=1 pnpm --filter @lambe/extension check:manifest` passes against it.
- [ ] **Step 5: Commit** `chore: gate debug logs, add the license and the privacy policy`.

---

### Task 16: Store listing, assets and README

**Files:**
- Create: `docs/store/listing.en.md`, `docs/store/listing.fr.md`, `apps/extension/scripts/render-promo.ts`, `docs/store/assets/promo-440x280.png`, `README.fr.md`
- Modify: `README.md` (English: install, onboarding, permissions explained, settings, providers incl. OpenAI-compatible, FR/EN, store build and `pnpm zip`; delete "Configuration override" and the "Store releases are blocked" paragraph; link `README.fr.md`, the privacy policy and the license)

**Interfaces:**
- Produces: each listing file holds name, short description (132 characters max, checked by a test), detailed description, one single purpose statement, a permission justification per permission (`storage`, `unlimitedStorage`: translation cache; `activeTab`, `scripting`: inject the page script on the user's click; `contextMenus`: reserved for the page menu entry or removed from the manifest if unused at the end of Task 10, in which case this task and Task 5 drop it together; localhost hosts: default Ollama; optional hosts: user chosen sites and remote provider), the data usage disclosures matching the privacy policy, and the privacy policy URL placeholder `<PRIVACY_POLICY_URL>` documented as the one manual step. `render-promo.ts` renders `assets/lambe-icon.svg` on a 440x280 canvas with Brave headless (`--screenshot --window-size=440,280`), no new dependency.

- [ ] **Step 1: Failing test.** `listing.test.ts` (apps/extension): `short_descriptions_fit_132_characters`, `both_listings_cover_every_manifest_permission`, `listings_mention_no_permission_the_manifest_lacks`.
- [ ] **Step 2: Run** `cd apps/extension && bun test scripts docs`. Expected: FAIL.
- [ ] **Step 3: Write** the docs and the script; run `bun scripts/render-promo.ts` and check the PNG is 440x280 (`file`).
- [ ] **Step 4: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: add the store listing, the promo tile and the bilingual readme`.

---

### Task 17: Real browser proof

**Files:**
- Create: `apps/extension/proof/stub-provider.ts` (Bun server: `/v1/models`, `/v1/chat/completions` SSE with a key check, a mode that answers 403 on Ollama paths and 401 on a bad key), `docs/store/assets/screenshot-{1,2,3,4,5}-1280x800.png`
- Modify: `README.md` (section "Plan 2 verification" with the measured results); owning task files only if a bug shows, test first

Run in Brave over CDP (`brave --remote-debugging-port=9222 --user-data-dir=<fresh> --load-extension=apps/extension/.output/chrome-mv3 --lang=fr`, then again with `--lang=en`), real Ollama with `translategemma:12b`, the stub for the error paths. Viewport changes with `Emulation.setDeviceMetricsOverride`, screenshots with `Page.captureScreenshot`.

- [ ] **Step 1: Build.** `pnpm --filter @lambe/extension build` (dev, with key). Confirm the extension id equals the id derived from `key`.
- [ ] **Step 2: Onboarding.** Fresh profile: the options page opens on install with the welcome in the browser language. Toolbar click on a page before consent opens the options page and sends zero requests (network log empty). Click consent: the welcome disappears, `consentAt` is set.
- [ ] **Step 3: Save and reload.** Change provider model and target, save, reload the page and the browser: values persist; corrupt `lambe:settings` by hand: banner with issues, defaults in use, stored value untouched until "Keep and fix".
- [ ] **Step 4: Connection.** Success with real Ollama (model list shown, missing model flagged). 403 path against Ollama without `OLLAMA_ORIGINS`: the three OS fixes show the exact `chrome-extension://<id>`. OpenAI-compatible stub: models listed, bad key shows the unauthorized hint, saving a non local URL prompts the origin permission.
- [ ] **Step 5: FR and EN.** Same walk in `--lang=fr` and `--lang=en`: no missing key, no English leak in French (scan the options DOM text and the bubble in French against the catalog), manifest name and action title localized.
- [ ] **Step 6: activeTab.** On `http://localhost` fixture page and an `https` page with no registered script (bubble absent): toolbar click injects, bubble appears and translation toggles; second click does not inject twice (one bubble host); a `chrome://extensions` tab shows the `!` badge, no console error.
- [ ] **Step 7: Bubble everywhere.** Toggle it: the browser prompts the two origins; reload any site: bubble present. Revoke the permission in `chrome://extensions`: bubble gone after reload and the setting shows "permission missing". Turn off: scripts unregistered (`chrome.scripting.getRegisteredContentScripts()` empty).
- [ ] **Step 8: YouTube.** Toggle: prompt for `youtube.com`; the Plan 3 button appears next to CC on a fixture video and translated captions play; toggle off removes both registrations.
- [ ] **Step 9: Per site.** Bubble menu "Auto translate this site" opens the Sites section prefilled; confirm grants the origin; reload: the page translates by itself. "Hide on this site" hides the bubble live. Menu "translate to another language" translates for this page only (setting unchanged).
- [ ] **Step 10: Layout.** Options page at 390, 768 and 1440 px: no horizontal scroll, sidebar becomes a select below 768, every section reachable, focus rings visible, dark and light. Take the five 1280x800 store screenshots (welcome, provider with test result, sites, prompt, a translated page with the bubble).
- [ ] **Step 11: Store build.** `pnpm zip`, unzip into a fresh dir, run `LAMBE_STORE=1 pnpm --filter @lambe/extension check:manifest` (PASS), load that unpacked store build and confirm install, consent and one translation work with the store id (the `OLLAMA_ORIGINS` fix then names the store id).
- [ ] **Step 12: Console.** `read_console_messages` on the options page, a translated page, the YouTube page and the service worker: no error from Lambë, no debug line while `debug` is off, debug lines appear after turning it on.
- [ ] **Step 13: Record** the measured results in "Plan 2 verification"; a failed expectation is fixed test first in its owning task, never by weakening the check.
- [ ] **Step 14: Run** `pnpm verify`. Expected: PASS, output attached to the report.
- [ ] **Step 15: Commit** `docs: record the settings and store readiness proof`.

---

### Task 18: Roadmap

**Files:**
- Modify: `docs/superpowers/plans/2026-10-18-roadmap.md`

- [ ] **Step 1:** Set the Plan 2 status to `Built and verified on feat/store-ready, see README`, add the plan file name to the Plan 2 paragraph, record the out of scope items of Decision 12 (glossary to Plan 4 or 5 or later, companion URL to Plan 4) and the one manual store step (privacy policy URL).
- [ ] **Step 2: Run** `pnpm verify`. Expected: PASS.
- [ ] **Step 3: Commit** `docs: mark plan 2 built and verified in the roadmap`.

---

## Self-review notes

- Coverage: spec 10 providers list, active one, connection test with the CORS fix (1, 12), default target language (13), prompt editor with reset and version (2, 14), per site auto translate and hide (8, 10, 13), cache size and clear (14), shortcut (14), bubble menu (10); glossary and companion URL are explicitly out (Decision 12). Spec 12 step 3 and the line 113 narrowing (2, 5, 6, 7). Spec 13: React, shadcn, tokens only, Tailwind for layout (11 to 14), boundaries in every task. Decisions 1 to 8 of the brief map to Tasks 5 to 7, 11, 3, 4, 1, 10, 15 and 16, 12.
- Reuse, named: `AdaptiveConcurrencyProvider`, `ProviderError`, `BatchTranslationService`, `StorageTranslationCache`, `sha256Hasher`, `placement.ts`, `TOGGLE_MESSAGE`, `PortBatchTranslator`, `loadRuntimeConfig` seam, `check:manifest`, release workflow zips.
- Checked: the toggle and `onMessage` path of the page script are unchanged, so the pre-existing ping through `isMissingReceiver` in the worker is what Task 6 generalizes; MAIN world safety, previously asserted on the static manifest, is asserted on `desiredRegistrations` (Task 7) and by the live check in Task 17 step 8.
- Open risks: WXT's `registration: "runtime"` output names and the CSS emitted for the isolated YouTube script must be read from the real build (Task 5 step 2); `permissions.request` needs a user gesture in the options page (Decision 3, proven in Task 17 steps 7 and 9); `@wxt-dev/i18n` plural and substitution syntax checked against its docs in Task 4; the `contextMenus` permission is kept only if a context menu entry ships, otherwise Tasks 5 and 16 drop it together.
