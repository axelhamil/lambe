# Lambë

[Français](README.fr.md)

A Chrome extension that translates web pages and YouTube captions in place with the model you choose: Ollama on your computer by default, or any OpenAI-compatible server. It keeps code untouched and domain jargon as professionals write it, and toggles back to the original instantly.

Lambë is Quenya for "tongue, language"; the bubble glyph is the tengwa of the same name.

## Requirements

- Chrome 130 or newer (or a Chromium browser on the same base) with Manifest V3.
- Node 24.20 or newer (`.nvmrc`), pnpm 11 (`packageManager`), Bun 1.4.0 for tests and scripts (`.bun-version`, also read by CI).
- A model server. The default is [Ollama](https://ollama.com) on `http://localhost:11434` with `ollama pull translategemma:12b`.
- New to local models? Follow the [beginner guide to running a local AI](docs/local-ai.md): hardware, install, model and setup.

## Install and build

```sh
pnpm install
pnpm --filter @lambe/extension build
```

Load it: open `chrome://extensions`, enable Developer mode, click **Load unpacked** and pick `apps/extension/.output/chrome-mv3`.

## First run

The settings page opens on install with a welcome screen. It says what leaves the browser (the text of the pages you translate and the captions you translate, sent only to the provider you configure) and asks for your consent. Until you agree, Lambë sends nothing: the toolbar icon, `Alt+L` and the bubble open the settings instead. You can withdraw consent at any time in **Privacy and about**.

## Use

- Toolbar icon or `Alt+L`: translate the current page, then toggle between the translation and the original.
- Click the bubble: translate the visible part of the page, then what you scroll to.
- Click again: back to the original, from memory, no request. Once more: translated again, no request.
- Double click: translate again, bypassing the cache and overwriting it.
- Drag the bubble: it snaps to the nearest edge and its tail flips.
- Right click the bubble: translate into another language for this page, translate this site automatically, hide the bubble on this site, or open the settings.

## Settings

| Section | What you set |
| --- | --- |
| Provider | Ollama or OpenAI-compatible, base URL, model (picked from the server's list), API key for OpenAI-compatible, and a connection test that explains each failure |
| Translation | The target language, by default the browser language |
| Sites | Show the bubble on every site, and per site rules: translate automatically, hide the bubble |
| YouTube | Translated captions in the player |
| Prompt | The guidelines the model follows; editing them starts a fresh cache for that text, reset restores the default |
| Cache | Size of the translations kept on the device, and a clear button |
| Shortcut | The current binding of the toggle command (default `Alt+L`) and a link to change it |
| Privacy and about | What is sent and where, consent, version, the privacy policy |

Settings live in `chrome.storage.local` under `lambe:settings`; the API key is kept apart under `lambe:secrets` and never logged. If stored settings are invalid or come from a newer version, Lambë runs on defaults, leaves them untouched and shows a banner to reset or fix them.

## Providers

- **Ollama** (default): `http://localhost:11434`, models listed from `/api/tags`. See [Allow the extension in Ollama](#allow-the-extension-in-ollama).
- **OpenAI-compatible**: any server that speaks `POST /v1/chat/completions` with streaming and `GET /v1/models` (LM Studio, vLLM, llama.cpp server, hosted APIs). Enter the base URL with or without `/v1` and the API key if the server needs one. Saving a base URL that is not on `localhost` asks Chrome for access to that origin only.

Provider requests leave from the background worker or the settings page, never from a content script.

## Permissions

Lambë asks for the least it needs and requests the rest when you turn on a feature.

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Settings, the optional API key and the translation cache, on the device only |
| `activeTab`, `scripting` | Inject the page script into the current tab when you click the toolbar icon or press `Alt+L` |
| `http://localhost/*`, `http://127.0.0.1/*` | Reach Ollama on your computer, on any port |
| `https://*/*`, `http://*/*` (optional) | Requested at click time for what you choose: the bubble on every site, a site translated automatically, YouTube captions, a remote provider |

The manifest declares no content script. The bubble on every site, automatic translation of a site and YouTube captions register their scripts at runtime once you grant the origin. Revoking an origin in `chrome://extensions` removes its scripts and turns the setting off.

## Languages

The interface follows the browser language, English or French (`apps/extension/locales`). Missing French strings fall back to English, and a test fails when the two catalogs drift.

## Extension id

The manifest carries a fixed public `key` (in `apps/extension/wxt.config.ts`), so the unpacked id is the same on every machine: `dccgcoohbalgmgkflpndagoallbcgnch`. To derive it from a build:

```sh
jq -r .key apps/extension/.output/chrome-mv3/manifest.json | base64 -d | sha256sum | head -c32 | tr 0-9a-f a-p
```

The private key is never committed. The store build has no `key`: the Chrome Web Store assigns its own id.

## Allow the extension in Ollama

Ollama answers 403 to origins it does not know. The bubble then turns red, and the connection test in the settings shows the fix for Linux, macOS and Windows with the id of the running extension. On Linux, run `sudo systemctl edit ollama`, then add:

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Save, then run `sudo systemctl restart ollama`. With the store build, use the store id instead.

## Optional: parallel requests

Nothing else is required. Lambë keeps one request queued ahead of the one streaming, so the GPU never waits between requests, and asks Ollama to keep the model loaded for 10 minutes (`keep_alive`). If you also add `Environment="OLLAMA_NUM_PARALLEL=4"` to the same `[Service]` block, Lambë sees the replies stream side by side, raises its concurrency up to 8 and splits the visible screen across the slots. Without it, Lambë stays at 1 request at a time. The learned concurrency is shared by every tab and kept for the same 10 minutes after the last reply, then Lambë starts again from 1.

## YouTube captions

Turn on **YouTube** in the settings first: Chrome asks for access to `https://www.youtube.com/*`. On a watch page, Lambë then adds a button to the player controls, left of the subtitles button. Click it to show the captions translated into the target language, in an overlay styled like YouTube's own captions; the native captions are hidden and turned on if they were off. Click again for the native captions as you found them, from memory and with no request; once more and the translation is back, also with no request. Turning the subtitles off in the player turns Lambë off too. Lambë reads the track the player itself loads and asks the model only a few sentences ahead of the playhead, so seeking and in app navigation work without a reload. A track already in the target language is shown as is, with no request.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm verify` | Biome, type check, tests, knip, jscpd, dependency-cruiser |
| `pnpm test` | Bun tests in every workspace |
| `pnpm fix` | Biome with fixes |
| `pnpm zip` | Store zip in `apps/extension/.output/*-chrome-store.zip`, built with `LAMBE_STORE=1` (no `key`) |
| `pnpm --filter @lambe/extension build` | Production build in `apps/extension/.output/chrome-mv3` |
| `pnpm --filter @lambe/extension dev` | WXT dev mode |
| `pnpm --filter @lambe/extension fixtures` | Serves the fixtures and the proof pages on `http://localhost:4173` |
| `bun apps/extension/scripts/render-promo.ts` | Renders the 440x280 store promo tile with Brave headless (`BRAVE_PATH` to use another Chromium) |

## Fixtures

`packages/translation/fixtures` holds saved pages for the DOM tests and the browser proof. `github-fork-a-repo.html` is GitHub Docs content under CC BY 4.0; its source and the changes made are listed in `packages/translation/fixtures/README.md`. `apps/extension/proof` holds `proof.html` (the fixture in 390, 768 and 1440 px frames, for comparing layouts only: the extension runs in the top frame, so to see a translation open `/github-fork-a-repo.html` directly at each width) and `strict-csp.html`, served with a strict `Content-Security-Policy`.

## Chrome Web Store

- Listing text, single purpose, permission justifications and data disclosures: [`docs/store/listing.en.md`](docs/store/listing.en.md) and [`docs/store/listing.fr.md`](docs/store/listing.fr.md). A test checks that the short descriptions fit 132 characters and that every manifest permission is justified, no more.
- Promo tile: `docs/store/assets/promo-440x280.png`.
- Privacy policy: [`docs/privacy-policy.md`](docs/privacy-policy.md). The listing and the settings link to it on GitHub, so the repository must be public before the store submission; that is the one manual step.
- Store build: `pnpm zip`, then `LAMBE_STORE=1 pnpm --filter @lambe/extension check:manifest` to check it has no `key`, no static content script and exactly the narrow permissions.
- Automatic publishing and its one time setup: [`docs/store/publishing.md`](docs/store/publishing.md).

## Release

[release-please](https://github.com/googleapis/release-please) runs on `main` (`.github/workflows/release.yml`). It reads Conventional Commits, opens a release PR, then tags and writes the changelog when that PR merges. Versions start from `.release-please-manifest.json` (`0.0.0`) with `bump-minor-pre-major`, and the extension `package.json` (hence the manifest version) follows the root. Never edit a version or a tag by hand.

When a release is created, the `publish` job checks out its tag, runs `pnpm verify` and builds two zips. `*-chrome.zip` is a loadable unpacked build that keeps its `key` (checked by `check:manifest`). `*-chrome-store.zip` is built with `LAMBE_STORE=1`, which drops the `key` the store rejects. Both are attached to the GitHub release. Then, if the store secrets exist, the job runs the store guard (`check:manifest` with `LAMBE_STORE=1`: no `key`, no static content script, and exactly the narrow `permissions`, `host_permissions` and `optional_host_permissions`) and submits the store zip to the Chrome Web Store with `wxt submit` over the CWS API v2. The submission uses `CHROME_PUBLISH_TYPE: DEFAULT_PUBLISH`: it goes live as soon as the review passes. Missing store secrets skip the submit with a notice, and **Run workflow** with an existing tag retries the publish without a new release. CI (`.github/workflows/ci.yml`) runs `pnpm install --frozen-lockfile`, `pnpm verify`, the extension build and `check:manifest` (the dev manifest keeps its `key`) on every pull request and on pushes to any branch but `main`. Both workflows are dormant until the repository has a remote.

Repository secrets:

- `BOT_CLIENT_ID`, `BOT_PRIVATE_KEY`: client id and private key of the GitHub App that cuts releases and uploads the zip (contents, issues and pull requests: read and write). The release-please token asks for contents, pull requests and issues write (issues for its labels), and the publish token only contents write, minted right before the upload.
- `CHROME_EXTENSION_ID`: the item id shown in the Chrome Web Store developer dashboard. Publishing is skipped while it is unset.
- `CHROME_PUBLISHER_ID`: the publisher id, in the dashboard account settings.
- `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`: a Google Cloud service account with the Chrome Web Store API enabled in its project, a JSON key downloaded for it (`client_email` and `private_key`), and its email added to the publisher in the developer dashboard. `pnpm --filter @lambe/extension exec wxt submit init` walks through the same steps.

The first store submission must be made by hand: upload the `*-chrome-store.zip` asset of a release in the developer dashboard, fill the listing and privacy tabs from `docs/store/listing.en.md`, and submit. API publishing only updates an item that already exists. The store assigns its own id, so the published extension id differs from the unpacked dev id derived from the `key` in `wxt.config.ts`, which only dev and unpacked builds carry: Ollama users of the store build need `OLLAMA_ORIGINS=chrome-extension://<store id>`.

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

## Plan 3 verification

Measured on 2026-10-23 in headless Brave over CDP with the extension loaded, `translategemma:12b` on local Ollama, target `fr`, cookie `PREF=hl=en&gl=US` so the English track is picked. Videos: `iG9CE55wbtY` (manual English track, 427 sentences), `XSu38uFEVuI` (the same talk with only an automatic English track) and `8g5Aif1khO8` (automatic French track).

| Check | Expected | Measured |
| --- | --- | --- |
| Track capture | the player's own request, none from the worker | every timedtext request has `base.js` and `captions.js` in its stack; 0 from the worker; the first translate leaves on click with no new fetch |
| First line, cold (model load, cache cleared) | shown | 2931 ms |
| First line, warm | under 1 s | 350 ms and 396 ms |
| Lead over 3 min at 1x, sampled every 1 s | never negative | 182 samples from 32 s to 213 s, after 10 s min 266.6 s, median 1015 s; 3.5 s at 1 s |
| Requests for the whole manual track | batched | 73 `/api/chat` for 427 sentences, 0 failed |
| Seek to 50 % (602 s) and 90 % (1083 s) | line under 1 s, old requests cancelled | 481 ms and 520 ms; the 5 requests in flight cancelled 106 ms and 122 ms after the seek |
| Line timing | within 100 ms of the cue | 67 lines checked, 0 off |
| Sentence length on the automatic track | at most 20 words | 278 sentences, longest 20 words (17 on the manual track) |
| Track already in French | no request | 0 `/api/chat`, original lines shown |

- Player: native captions are hidden while translating. The line sits 11 px above the player bottom with the controls hidden and 64 px with them shown in the default view, 10 px in theater view, and clears the fullscreen quick actions (line bottom at 416 px, quick actions from 424 px, control bar from 485 px of a 544 px player); with the controls hidden in fullscreen it drops back to the bottom.
- Toggle: the second click brings the native captions back as found; the third shows the lines again in 4 ms with 0 requests.
- Navigation: after an in app click to another video the overlay switches to the new track. The first request goes out 667 ms after the click with an empty title, channel and description, since YouTube swaps the watch metadata later; every later request carries the new video's title, channel and description.
- Subtitles: turning them off in the player turns Lambë off; with them off, Lambë turns them on and its second click turns them off again.
- Console: compared with the same journey with the extension disabled, no new error. The page and the worker log only YouTube's own noise (blocked ad requests, sandboxed frames, WebGL and preload warnings).
- Not verified: hiding during an ad, since no ad played; jargon, since the talk has none.

Samples from `iG9CE55wbtY`, sentences 2 to 21 from 31.1 s. Manual cues are sentence fragments, so the model sometimes capitalizes or ends a fragment as a sentence.

| Start | Original | Translation |
| --- | --- | --- |
| 31.1 s | It's been great, hasn't it? | Ça a été formidable, n'est-ce pas ? |
| 33.4 s | I've been blown away by the whole thing. | J'ai été complètement impressionné par tout cela. |
| 35.8 s | In fact, I'm leaving. | En fait, je suis en train de partir. |
| 37.3 s | (Laughter) | (Rire) |
| 43.1 s | There have been three themes running through the conference, | Trois thèmes principaux ont traversé cette conférence, |
| 46.7 s | which are relevant to what I want to talk about. | et qui sont pertinents pour ce que je veux aborder. |
| 49.0 s | One is the extraordinary evidence of human creativity | L'un d'eux est la preuve extraordinaire de la créativité humaine. |
| 53.5 s | in all of the presentations that we've had | Dans toutes les présentations que nous avons entendues. |
| 55.9 s | and in all of the people here; | Et chez toutes les personnes présentes ici. |
| 57.9 s | just the variety of it and the range of it. | Juste la diversité et l'étendue de cette créativité. |
| 61.2 s | The second is that it's put us in a place | Le deuxième point est que cela nous place |
| 63.3 s | where we have no idea what's going to happen | dans une situation où nous ne savons pas |
| 65.8 s | in terms of the future. | ce qui va se passer dans le futur. |
| 67.3 s | No idea how this may play out. | Je ne sais pas comment cela va se dérouler. |
| 70.3 s | I have an interest in education. | Je m'intéresse à l'éducation. |
| 71.9 s | Actually, what I find is, everybody has an interest in education. | En réalité, je constate que tout le monde s'intéresse à l'éducation. |
| 76.4 s | Don't you? | N'est-ce pas vrai ? |
| 77.7 s | I find this very interesting. | Je trouve cela très intéressant. |
| 79.1 s | If you're at a dinner party, and you say you work in education -- | Si vous êtes à une soirée, et que vous dites que vous travaillez dans l'éducation... |
| 83.1 s | actually, you're not often at dinner parties, frankly. | En réalité, on ne va pas souvent à des dîners, pour être honnête. |

## License

[MIT](LICENSE).
