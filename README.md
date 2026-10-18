# Lambë

A Chrome extension that translates web pages in place with a local LLM. It keeps code untouched and domain jargon as professionals write it, and toggles back to the original instantly. A floating bubble on each page starts, toggles and re-runs the translation.

Lambë is Quenya for "tongue, language"; the bubble glyph is the tengwa of the same name.

## Requirements

- Chrome (or any Chromium browser) with Manifest V3.
- Node 24.20 or newer (`.nvmrc`), pnpm 11 (`packageManager`), Bun 1.4 for tests and scripts.
- [Ollama](https://ollama.com) on `http://localhost:11434` with the default model: `ollama pull translategemma:12b`.

## Install and build

```sh
pnpm install
pnpm --filter @lambe/extension build
```

Load it: open `chrome://extensions`, enable Developer mode, click **Load unpacked** and pick `apps/extension/.output/chrome-mv3`.

The production build mounts the bubble in the top frame only. `LAMBE_ALL_FRAMES=1 pnpm --filter @lambe/extension build` runs the content script and the bubble in every frame; the proof page below needs it.

## Extension id

The manifest carries a fixed public `key` (in `apps/extension/wxt.config.ts`), so the id is the same on every machine: `dccgcoohbalgmgkflpndagoallbcgnch`. To derive it from a build:

```sh
jq -r .key apps/extension/.output/chrome-mv3/manifest.json | base64 -d | sha256sum | head -c32 | tr 0-9a-f a-p
```

The private key is never committed.

## Allow the extension in Ollama

Ollama answers 403 to origins it does not know. The bubble then turns red and its tooltip gives this fix. Run `sudo systemctl edit ollama`, then add:

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Save, then run `sudo systemctl restart ollama`.

## Optional: parallel requests

Nothing else is required. Lambë keeps one request queued ahead of the one streaming, so the GPU never waits between requests, and asks Ollama to keep the model loaded for 30 s (`keep_alive`). If you also add `Environment="OLLAMA_NUM_PARALLEL=4"` to the same `[Service]` block, Lambë sees the replies stream side by side, raises its concurrency up to `provider.concurrency` (default 8) and splits the visible screen across the slots. Without it, Lambë stays at 1 request at a time.

## Configuration override

There is no settings page yet. Defaults: Ollama on `http://localhost:11434`, `translategemma:12b`, target language from the browser UI. To override, open the service worker console (`chrome://extensions`, Lambë, **service worker**) and run:

```js
chrome.storage.local.set({ "lambe:config": { target: "fr" } })
```

Other keys: `provider` (`baseUrl`, `model`, `concurrency` as an upper bound, `timeoutMs`), `contextTokens`, `maxSegmentsPerBatch`, `maxSegmentsPerRequest`, `firstRequestSegments`. Reload the extension after changing the provider and the page after changing the target. An invalid override falls back to the defaults.

## Use

- Click the bubble: translate the visible part of the page, then what you scroll to.
- Click again: back to the original, from memory, no request. Once more: translated again, no request.
- Double click: translate again, bypassing the cache and overwriting it.
- Drag the bubble: it snaps to the nearest edge and its tail flips.
- `Alt+L` or the toolbar icon: toggle.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm verify` | Biome, type check, tests, knip, jscpd, dependency-cruiser |
| `pnpm test` | Bun tests in every workspace |
| `pnpm fix` | Biome with fixes |
| `pnpm --filter @lambe/extension build` | Production build in `apps/extension/.output/chrome-mv3` |
| `pnpm --filter @lambe/extension dev` | WXT dev mode |
| `pnpm --filter @lambe/extension fixtures` | Serves the fixtures and the proof pages on `http://localhost:4173` |

## Fixtures

`packages/translation/fixtures` holds saved pages for the DOM tests and the browser proof. `github-fork-a-repo.html` is GitHub Docs content under CC BY 4.0; its source and the changes made are listed in `packages/translation/fixtures/README.md`. `apps/extension/proof` holds `proof.html` (the fixture in 390, 768 and 1440 px frames) and `strict-csp.html`, served with a strict `Content-Security-Policy`.

## Release

[release-please](https://github.com/googleapis/release-please) runs on `main` (`.github/workflows/release.yml`). It reads Conventional Commits, opens a release PR, then tags and writes the changelog when that PR merges. Versions start from `.release-please-manifest.json` (`0.0.0`) with `bump-minor-pre-major`, and the extension `package.json` (hence the manifest version) follows the root. Never edit a version or a tag by hand.

When a release is created, the `publish` job checks out its tag, runs `pnpm verify`, builds `wxt zip -b chrome` with `LAMBE_STORE=1` (which drops the manifest `key`, rejected by the store) and without `LAMBE_ALL_FRAMES`, checks that the manifest has no `key`, attaches the zip to the GitHub release and, if the store secrets exist, submits it to the Chrome Web Store with `wxt submit` over the CWS API v2. The submission is staged (`CHROME_PUBLISH_TYPE: STAGED_PUBLISH`): once approved it waits for a manual publish in the developer dashboard. To publish as soon as the review passes, remove that line from the submit step in `release.yml`. CI (`.github/workflows/ci.yml`) runs `pnpm install --frozen-lockfile`, `pnpm verify`, the extension build and `check:manifest` (the dev manifest keeps its `key`) on every pull request and on pushes to any branch but `main`. Both workflows are dormant until the repository has a remote.

Repository secrets:

- `BOT_CLIENT_ID`, `BOT_PRIVATE_KEY`: client id and private key of the GitHub App that cuts releases and uploads the zip (contents and pull requests: read and write).
- `CHROME_EXTENSION_ID`: the item id shown in the Chrome Web Store developer dashboard. Publishing is skipped while it is unset.
- `CHROME_PUBLISHER_ID`: the publisher id, in the dashboard account settings.
- `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`: a Google Cloud service account with the Chrome Web Store API enabled in its project, a JSON key downloaded for it (`client_email` and `private_key`), and its email added to the publisher in the developer dashboard. `pnpm --filter @lambe/extension exec wxt submit init` walks through the same steps.

The first store submission must be made by hand: upload a zip from a release in the developer dashboard, fill the listing and privacy tabs, and submit. API publishing only updates an item that already exists. The store assigns its own id, so the published extension id differs from the unpacked dev id derived from the `key` in `wxt.config.ts`, which only dev and unpacked builds carry: Ollama users of the store build need `OLLAMA_ORIGINS=chrome-extension://<store id>`.

## Plan 1 verification

Measured on 2026-10-18 in headless Brave over CDP, `translategemma:12b` on local Ollama, target `fr`, cache cleared before each frame, on `proof.html` (frames of 375, 753 and 1425 px of layout width once the scrollbar is removed).

| | 390 px | 768 px | 1440 px |
| --- | --- | --- | --- |
| First translated paragraph | 3.6 s | 4.0 s | 9.9 s |
| Visible screen translated | 6.9 s | 8.3 s | 17.0 s |
| Requests for the first screen | 6 | 8 | 14 |
| Requests after 3 screens of scroll | 15 | 16 | 21 |
| Blocks translated after 3 screens | 40 of 253 | 55 of 253 | 91 of 253 |

- Error path: against a server answering 403, the bubble shows the error state, the tooltip holds `OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch`, the page is untouched and exactly 1 request is sent; the count is still 1 after 18 s.
- Code: the 36 `pre`, `code` and `kbd` elements are byte for byte identical after translation in every frame.
- Jargon: `fourchette` appears 0 times. `fork` survives in 16 of 17, 16 of 21 and 24 of 26 translated blocks that contain it; the other blocks say "copie". `pull request` survives in 1 of 6 blocks; the others say "demande de fusion" or "demande de tirage". A glossary is planned for Plan 2.
- Toggle (1440 px frame): the original comes back with `documentElement.outerHTML` identical to the capture taken before translating, with 0 requests, in 1 DOM batch of under 1 ms. The first DOM change lands 0.4 ms after the pointer up: a single click acts at once, and a second click within 250 ms turns it into a double click. Toggling again restores the translated page identically, also with 0 requests.
- Revisit (1440 px frame): with headings that end in an empty anchor now cached, the first screen takes 10 requests instead of 14. The next visit sends 1 request, for a navigation item the first visit never reached, and the one after sends 0.
- Double click (1440 px frame): 10 new requests; 54 cache entries are overwritten and the page never shows the stale values planted in them.
- Bubble: at every width, dragged to the opposite edge it snaps to `left: 4px`, clamps to the bottom edge (`top = height - 38 - 6`), flips its tail (`scaleX(-1)`), stays inside the frame and still answers clicks; dragged back, it snaps to `width - 38 - 4`.
- Strict CSP (`style-src 'self'`, no inline): the bubble is styled exactly as on a normal page (38 px, fixed, same fill and stroke), with 0 CSP violations, and the page translates.
- Console: no error from the content script or the service worker. The host page logs 31 404s for fixture images and 8 CORS errors for docs.github.com fonts, which come from the saved fixture.
