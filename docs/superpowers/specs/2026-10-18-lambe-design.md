# Lambë: design

Date: 2026-10-18
Status: draft
Name: Lambë, Quenya for "tongue, language". The button glyph is the tengwa of the same name.

## 1. Intent

A Chrome extension that translates web pages and YouTube captions with an LLM that understands context, local first (Ollama) or through any API the user picks.

Why: Google Translate in Chrome translates words, not meaning. On a GitHub doc it turns "fork" into "fourchette", translates code, and the page becomes unreadable for the person it was meant to help. Lambë must read like a page written by someone who knows the domain: jargon kept, code untouched, prose translated.

User: one person (the author), French native, reading tech docs, videos and the wider web in many languages. Default target French, but any language to any language.

Success: a GitHub, MDN or framework doc translated by Lambë reads naturally in French, with zero touched code, terms like fork, pull request, merge, hook, middleware left as they are, and a toggle back to the original that is instant.

## 2. Goals

1. Translate the visible part of any page on click, keeping code and domain jargon intact.
2. One floating, discreet, draggable button that toggles original and translated in one click, instantly from cache.
3. Translate YouTube captions into the default language from a button in the player control bar.
4. Videos without captions: transcribe locally (Whisper on the GPU) and translate.
5. Work with any provider: Ollama by default, any OpenAI compatible endpoint (LM Studio, llama.cpp server, vLLM, OpenRouter, OpenAI, Gemini OpenAI compatible), local or cloud.
6. A strong default prompt, editable, with a reset to default.

## 3. Non goals (v1)

- Firefox, Safari, mobile browsers.
- PDF viewer, images (OCR), canvas text.
- Accounts, sync across devices, telemetry, paid plans.
- Publishing on the Chrome Web Store (load unpacked first; store later is possible, keep it in mind for permissions).
- Bilingual display (original under translated). The decision is replace, with instant toggle.
- Live captions on non YouTube video sites (later phase, see 9.4).

## 4. Anti goals (failure even if it "works")

- Any change to code: `pre`, `code`, `kbd`, `samp`, inline code, CLI commands, file paths, URLs, identifiers. Only comments inside code blocks may be translated.
- Translating domain jargon of any field (dev, medicine, law, finance, gaming) into literal nonsense.
- Breaking the page: layout shift that loses scroll position, broken event handlers, React or Vue hydration errors, forms that stop working.
- Burning the GPU on content never seen: translation is lazy, viewport plus one screen ahead.
- A visible, noisy UI: the button is translucent and stays out of the way.
- Sending page content to a cloud service the user did not explicitly configure.

## 5. Constraints

- Chrome, Manifest V3.
- Machine: Arch Linux, RTX 5070 Ti 16 GB VRAM. Ollama has `translategemma:12b` (8.1 GB). Whisper models already in the Hugging Face cache: `Systran/faster-whisper-large-v3`, `large-v2`, `small`, `bofenghuang/whisper-large-v3-french`. `whisper-cli` (whisper.cpp) in `~/.local/bin`.
- Translation model and STT model share 16 GB: large-v3 (about 5 GB) plus translategemma 12B (about 8 GB) fit, barely. The companion unloads its model when idle.
- No model or tool from a Chinese vendor (excludes Qwen, Seed-X, Hunyuan-MT, SenseVoice).
- Ollama rejects extension origins by default: needs `OLLAMA_ORIGINS=chrome-extension://<id>` set through a systemd override (`systemctl edit ollama`), not a shell export. The options page tests the connection and shows that exact fix when it gets a 403.
- TranslateGemma: no system message, a single `user` message with source and target language codes, short context (about 2K tokens). Instruction models (Gemma 4, Mistral Small) take a system prompt. The provider layer must support both shapes.
- Prior art to study, not copy (GPL-3.0): Read Frog, KISS Translator. Immersive Translate is closed source.
- Repo conventions from the author's global rules: TypeScript strict, Bun, pnpm workspaces, Biome, knip, husky with commitlint, release-please. Code and product text in English.

## 6. Decided UX

### 6.1 Page translation

- Translation starts on click only. Option: auto translate per site (a list in settings, also toggled from the bubble menu).
- Replace in place, no bilingual view.
- Lazy: translate what is in the viewport plus one screen ahead, keep ahead while scrolling (like a virtualized list). New content (infinite scroll, SPA navigation, expanded sections) is picked up as it appears.
- Source language auto detected per block; blocks already in the target language are skipped, so a page already in French costs nothing. (Builder call.)
- Source language auto detected. Target: one default language in settings (French for the author, browser UI language as initial default), changeable per page from the bubble menu.
- Code untouched; comments in code blocks translated; jargon of the page's domain kept.

### 6.2 Floating bubble

Reference mockup: `docs/mockups/bubble-lambe.fragment.html` (fragment rendered by the superpowers brainstorm server; the logic is plain JS and reusable as a spec of behavior).

- A speech bubble outline, translucent (about 55 % opacity at rest, 100 % on hover or when translated), 38 px.
- At rest it shows "Aa". Translated: the tengwa lambë glows in the accent color (`#7ee0c3` in the mockup). Translating: the outline dashes run and the glyph pulses.
- Glyph source: `assets/tengwa-lambe.svg`, public domain (Wikimedia Commons, `File:Tengwa_lambe.svg`, by Tasnu Arakun, from the Tengwar Eldamar font).
- Draggable with the mouse; on release it snaps to the nearest left or right window edge, keeping its vertical position, and the tail of the bubble flips to point at that edge.
- Single click: toggle original and translated. First click translates; later clicks swap instantly from memory and cache.
- Double click (within about 250 ms): re-translate the page, bypassing and overwriting the cache.
- Error state (provider unreachable, 403 CORS): distinct look and a tooltip with the reason and the fix.

### 6.3 YouTube

- A lambë button injected in the player right controls, next to CC, same glyph, YouTube style (white glyph, red underline when active like CC).
- Click: captions translated into the default language. Click again: original captions. Instant after the first time (cache).
- Captions are shown in Lambë's own overlay synced to the video, replacing the native caption rendering while active.
- No captions at all: the local companion transcribes (see 9). A few seconds of startup delay is accepted to get ahead; quality over immediacy (author's call accepted by default).

## 7. Translation quality

### 7.1 Protecting what must not change

The extension, not the model, guarantees code is untouched:

- Excluded subtrees: `script`, `style`, `noscript`, `pre`, `code`, `kbd`, `samp`, `var`, `textarea`, `input`, `select`, `[contenteditable]`, `[translate="no"]`, `.notranslate`, `svg`, `math`.
- Inline protected nodes inside a translatable block (inline `code`, `kbd`, links whose text is a URL or path) are replaced by numbered placeholders before sending, restored after. A response that loses or duplicates a placeholder is rejected and retried, then the block falls back to the original.
- Inline formatting inside a block (`b`, `em`, `a` with ordinary text, `span`): the whole block is sent with numbered paired tags so the model can reorder words across them, then the DOM is rebuilt from the original nodes (attributes, listeners and identity kept). If the tags come back invalid, fall back to translating each text node separately. (Builder call.)
- Comments in code blocks: translated only when a syntax highlighter marks them (GitHub `.pl-c`, highlight.js `.hljs-comment`, Prism `.token.comment`, Shiki and CodeMirror comment classes). Unhighlighted code is never touched.

### 7.2 Context and jargon

- A page brief is built once per page: domain, title, meta description, `h1` and first headings, detected source language. It goes with every batch.
- The default prompt tells the model to infer the field from the brief and keep its terms of art in their usual form for a native professional of that field (in French tech writing: fork, pull request, merge, commit stay English). It also asks to keep tone, register and formatting, and to return exactly the segments it received.
- Per site glossary (optional, in settings): terms to keep or force a translation for, injected into the prompt.
- Translation units are blocks (paragraph, list item, heading, table cell), with neighbouring blocks sent together so the model sees context.

### 7.3 Prompt

- One default prompt, versioned in code, editable in settings with a "reset to default" action.
- The prompt version is part of the cache key, so editing it naturally invalidates old translations.
- Per model adapter: TranslateGemma gets its expected single user message format (the brief and glossary folded into it); instruction models get system plus user messages.

## 8. Engine (decided parts)

- Providers: Ollama native API and the OpenAI compatible chat API. Several providers can be configured; one is active. Settings hold base URL, model, optional API key (cloud), and a connection test.
- Requests go from the extension's background service worker, never from the page context.
- The content script and the bubble run on every page (`<all_urls>` host permission for v1, load unpacked), declared in one place so it can be narrowed to `activeTab` plus optional permissions before any store release. (Builder call.)
- Delivery step 1 has no bubble yet: translation is triggered by the `chrome.commands` shortcut and the toolbar action. (Builder call.)
- Scheduling: a priority queue, visible blocks first, then the next screen; blocks scrolled far away are dropped from the queue; a fixed concurrency per provider (1 for local Ollama by default).
- Batches sized to the model context (small for TranslateGemma), with a structured in and out format keyed by segment id, validated before applying.
- Cache: persistent (survives tab and browser restart), keyed by hash of source text, source and target language, page host, provider, model, prompt version, so a translation is only reused on the host that produced it. Settings show its size and offer a clear button.
- Toggle swaps between stored original and translated text per node, without re-rendering the page.
- Model choice: keep `translategemma:12b` as default; ship an eval harness (section 11) and compare against `gemma4:12b-it-qat` and Mistral Small before changing the default.

## 9. YouTube captions and the companion

### 9.1 Getting captions

Direct calls to YouTube's timedtext endpoint now often need a PoToken and return empty bodies. Lambë reads the captions the player itself loads: a main world script observes the player's own caption responses (json3) and hands them to the content script. If the user has captions off, Lambë asks the player to load the track (the auto generated one when it is the only one) without displaying it.

### 9.2 Translating captions

- Auto generated captions come as word fragments: re-segment into sentences first, translate sentences with a window of neighbours as context, then map each translated sentence back onto the time span of its source sentence.
- The whole track is translated ahead of playback, in order from the current time, so seeking forward is covered quickly.

### 9.3 Companion (videos without captions)

A small local server, separate from the extension (Chrome cannot run Python).

- Python, `faster-whisper` large-v3 on CUDA, word timestamps refined by CTC forced alignment. Afterlive already does exactly this (`~/DEV/perso/afterlive/apps/ml-worker/src/afterlive_ml/transcription/aligned_transcriber.py`, `ctc_alignment.py`, `wav2vec2_aligner.py`): reuse the approach. Afterlive's aligner model is French only; Lambë needs a multilingual aligner (Meta MMS forced aligner, CC-BY-NC: fine for personal use, to revisit before any public release) or a per language wav2vec2 table. Afterlive code is copied and adapted, the repos stay independent. (Builder call.)
- For YouTube, the companion fetches the audio itself from the video URL (`yt-dlp`) and transcribes faster than real time, so captions run ahead of playback after a short startup. This is why a few seconds of startup delay is enough. (Builder call accepted here: this beats capturing tab audio in real time for YouTube.)
- Output: timed sentence segments in the source language, sent back to the extension, which translates them through the normal engine.
- Localhost only, a shared token between extension and companion, idle unload of the model to free VRAM.
- Distribution: a uv project with a `systemd --user` unit; docs to start it.

### 9.4 Later

Live captions for any other video site through `chrome.tabCapture` streaming audio to the companion.

## 10. Settings

An options page (React, shadcn):

- Providers (list, active one, connection test with the Ollama CORS fix).
- Default target language; source auto.
- Prompt editor with reset; prompt version shown.
- Per site: auto translate, hide the bubble, glossary.
- Cache size and clear.
- Companion URL and status.
- A keyboard shortcut for the toggle (via `chrome.commands`, user rebindable in Chrome).

The bubble also has a small menu (right click on the bubble): target language for this page, auto translate this site, hide on this site, open settings.

## 11. Verification

- Fixture pages saved from the real web: a GitHub doc with code blocks and inline code, MDN, a framework doc, one non dev domain page (medical or gaming wiki), one SPA with infinite scroll, a YouTube watch page with auto captions.
- Hard checks (automated): every protected node byte identical after translation and after toggle back; placeholder count preserved; original restored exactly on toggle; no console errors from the host page.
- Quality eval harness: a script that runs a fixed segment set through several models and prompts and writes a side by side report, to choose the default model on evidence.
- Real browser proof on the fixtures (Chrome at 390, 768, 1440 px; the bubble must stay usable on narrow windows).

## 12. Delivery order

1. Engine and page translation with Ollama, protection of code, cache, toggle (no polish).
2. Bubble: drag, snap, tail, states, click and double click, menu.
3. Settings, providers, prompt editor, per site options, shortcut.
4. YouTube with existing captions.
5. Companion and captions for videos without any.
6. Eval harness and default model decision (can run in parallel from step 1).

## 13. Code standards (author's rules, binding)

The author's global rules in `~/.claude/rules/40-quality.md` and `30-tools.md` apply in full; the plan must follow them, not paraphrase them. What matters most here:

- SOLID and clean architecture: the translation engine (segmentation, protection, batching, cache policy, prompt building) is pure TypeScript with no Chrome API and no DOM global, behind ports. Chrome APIs, IndexedDB, providers, the DOM and YouTube are adapters. Composition root explicit, no scan.
- Monorepo layout from the rules: pnpm workspaces, `apps/*` as composition roots (extension, companion), `packages/<feature>` with `domain/`, `application/` (framework free), `infrastructure/`, boundaries enforced by `dependency-cruiser` or `eslint-plugin-boundaries`, public API through `package.json` `exports`, packages shipped as TS source.
- Domain modeling where a rule exists: typed ids, value objects validated by a Zod schema (language code, segment, placeholder token, prompt version), `Result<T, E>` with typed codes for business errors, `Option<T>` for absence, no `T | null` in a port. No DDD ceremony for plumbing (settings, per site flags are typed config).
- TS strict, no `as X`, no `!`, guarded index access; no comments except tool directives; no barrel `index.ts`; files grouped by domain folders, never a flat `utils` or `lib`, tests mirrored.
- UI (options page, bubble menu): React, shadcn, styles only through global tokens, Tailwind for layout only, minimal markup. The bubble itself lives in a Shadow DOM so host page CSS cannot reach it.
- Tooling: Bun (runtime and `bun test`), Biome, knip, jscpd, husky with commitlint, Conventional Commits, release-please. Companion: Python with uv.
- Tests: behavior, one scenario per business rule on the use case (given, when, then), ports mocked by the runner; real browser proof on fixtures for anything visual.

## 14. Left to the builder

- Extension framework and bundler (WXT, CRXJS or plain Vite), state management, storage library for the cache.
- Exact prompt wording, batch sizes, concurrency numbers, the structured batch format.
- How the main world script hooks the YouTube player, and the caption overlay styling (close to YouTube's).
- Monorepo layout (extension app, companion app, shared packages if any), following the author's rules.
- Language picker UX and the list of languages offered.
