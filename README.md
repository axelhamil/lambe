<p align="center">
  <img src="assets/lambe-icon.svg" alt="Lambë: the tengwa lambe, a curved stroke in mint green on a dark rounded square" width="112">
</p>

<h1 align="center">Lambë</h1>

<h3 align="center">Read the web in your language, with a model you own.</h3>

<p align="center">A free, open source Chrome extension that translates web pages and YouTube captions in place, with Ollama on your computer by default. The text stays on your machine, code stays untouched, and the original is one click away.</p>

<p align="center"><a href="README.fr.md">Français</a></p>

> [!WARNING]
> **Early days.** Lambë is in `0.x`. Every release is a pre-release, and settings or behavior may still change. The Chrome Web Store listing is coming; until then, [install it from a release or from source](#quick-start).

<div align="center">

<table>
  <tr>
    <td>Proved by CI</td>
    <td>
      <a href="https://github.com/axelhamil/lambe/actions/workflows/ci.yml"><img alt="ci" src="https://img.shields.io/github/actions/workflow/status/axelhamil/lambe/ci.yml?branch=develop&style=flat-square&logo=githubactions&logoColor=white&label=ci"></a>
      <a href="https://github.com/axelhamil/lambe/actions/workflows/release.yml"><img alt="release workflow" src="https://img.shields.io/github/actions/workflow/status/axelhamil/lambe/release.yml?branch=develop&style=flat-square&logo=githubactions&logoColor=white&label=release"></a>
    </td>
  </tr>
  <tr>
    <td>Built on</td>
    <td>
      <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-1F2937?style=flat-square&logo=googlechrome&logoColor=white"></a>
      <a href="https://wxt.dev"><img alt="WXT" src="https://img.shields.io/badge/WXT-1F2937?style=flat-square"></a>
      <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-1F2937?style=flat-square&logo=typescript&logoColor=white"></a>
      <a href="https://react.dev"><img alt="React" src="https://img.shields.io/badge/React-1F2937?style=flat-square&logo=react&logoColor=white"></a>
      <a href="https://ollama.com"><img alt="Ollama" src="https://img.shields.io/badge/Ollama-local%20first-1F2937?style=flat-square&logo=ollama&logoColor=white"></a>
      <a href="https://bun.sh"><img alt="Bun" src="https://img.shields.io/badge/Bun-tests-1F2937?style=flat-square&logo=bun&logoColor=white"></a>
      <a href="https://pnpm.io"><img alt="pnpm" src="https://img.shields.io/badge/pnpm-workspaces-1F2937?style=flat-square&logo=pnpm&logoColor=white"></a>
    </td>
  </tr>
  <tr>
    <td>Project</td>
    <td>
      <a href="https://github.com/axelhamil/lambe/releases"><img alt="latest release" src="https://img.shields.io/github/v/release/axelhamil/lambe?include_prereleases&sort=semver&style=flat-square&color=1F7A63&label=release"></a>
      <a href="LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-1F7A63?style=flat-square"></a>
      <a href="docs/privacy-policy.md"><img alt="no analytics" src="https://img.shields.io/badge/analytics-none-1F7A63?style=flat-square"></a>
      <a href="https://www.conventionalcommits.org"><img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-1F7A63?style=flat-square&logo=conventionalcommits&logoColor=white"></a>
      <a href="https://github.com/googleapis/release-please"><img alt="release-please" src="https://img.shields.io/badge/release--please-1F7A63?style=flat-square"></a>
    </td>
  </tr>
</table>

</div>

<p align="center">
  <img src="docs/store/assets/screenshot-1-1280x800.png" alt="A Wikipedia article translated in place by Lambë, its bubble at the right edge" width="100%">
</p>

**Lambë** translates the page you are reading without leaving it, with the model you choose: [Ollama](https://ollama.com) on your computer by default, or any OpenAI-compatible server. It keeps code untouched and domain jargon as professionals write it, and toggles back to the original instantly.

Why it is different:

- **Local first.** Out of the box it talks to Ollama on `localhost`, so the pages you translate never leave your machine. No account, no subscription, no quota.
- **In place, and reversible.** The text is replaced where it stands, the visible screen first. One click brings the original back from memory, byte for byte, with no request.
- **It respects what it reads.** Code blocks stay identical, and terms of art (fork, pull request, merge, commit) stay the way professionals write them in your language.
- **YouTube too.** Captions are translated a few sentences ahead of the playhead, in an overlay styled like YouTube's own.

> [!TIP]
> Never ran a model on your computer? The [beginner guide to running a local AI](docs/local-ai.md) ([en français](docs/local-ai.fr.md)) walks through the hardware, the install, the model and the setup, with commands to copy and paste.

## Philosophy

- **Your text, your machine.** Page text and captions go only to the provider you configure, and nowhere else. Nothing goes to the developer: no analytics, no remote code, no third party translator. The [privacy policy](docs/privacy-policy.md) lists every piece of data the extension handles.
- **Consent before the first word.** Until you agree on the welcome screen, Lambë sends nothing.
- **The least permissions it needs.** Access to a site is requested only when you turn on a feature that needs it, and revoking it turns the feature off.
- **Your model, your rules.** You pick the server and the model, and you can edit the guidelines the model follows.
- **Free and open source.** Lambë is MIT licensed, built in the open, and free to use, fork and improve ([contributing](#contributing)).

## See it

| | |
|---|---|
| <img src="docs/store/assets/screenshot-2-1280x800.png" alt="The Provider settings: Ollama on localhost, the translategemma model and a successful connection test"> | <img src="docs/store/assets/screenshot-3-1280x800.png" alt="The Sites settings: the bubble on every site, and sites that translate automatically or hide the bubble"> |
| **Provider**: pick the server and the model, test the connection. | **Sites**: translate some sites on their own, hide the bubble on others. |
| <img src="docs/store/assets/screenshot-4-1280x800.png" alt="The Prompt settings: the guidelines the model follows, with save and reset"> | <img src="docs/store/assets/screenshot-5-1280x800.png" alt="The welcome screen that asks for consent before Lambë translates anything"> |
| **Prompt**: the guidelines the model follows, editable. | **Consent**: nothing is sent until you agree. |

## Quick start

You need Chrome 130 or newer (or a Chromium browser on the same base, such as Brave) and a model server. The default is Ollama on `http://localhost:11434` with `ollama pull translategemma:12b`.

1. **Get a model running.** Install Ollama and pull the model, step by step, with the [beginner guide](docs/local-ai.md).
2. **Install Lambë**, one of three ways:
   - **Chrome Web Store**: coming soon; the link goes here once the listing is live.
   - **From a release**: download the `*-chrome.zip` asset of the [latest release](https://github.com/axelhamil/lambe/releases) and unzip it.
   - **From source**: clone the repository, then

     ```sh
     pnpm install
     pnpm --filter @lambe/extension build
     ```

   For a release or a source build, open `chrome://extensions`, enable Developer mode, click **Load unpacked** and pick the unzipped folder, or `apps/extension/.output/chrome-mv3`.
3. **Allow Lambë in Ollama**, which answers 403 to origins it does not know ([below](#allow-the-extension-in-ollama)).
4. **Agree on the welcome screen.** The settings page opens on install. It says what leaves the browser (the text of the pages you translate and the captions you translate, sent only to the provider you configure) and asks for your consent. Until you agree, Lambë sends nothing: the toolbar icon, `Alt+L` and the bubble open the settings instead. You can withdraw consent at any time in **Privacy and about**.
5. **Translate**: press `Alt+L` on any page.

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

## Allow the extension in Ollama

Ollama answers 403 to origins it does not know. The bubble then turns red, and the connection test in the settings shows the fix for Linux, macOS and Windows with the id of the running extension. On Linux, run `sudo systemctl edit ollama`, then add:

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Save, then run `sudo systemctl restart ollama`. With the store build, use the store id instead. macOS and Windows are covered in the [beginner guide](docs/local-ai.md#3-let-lambë-talk-to-ollama).

### Optional: parallel requests

Nothing else is required. Lambë keeps one request queued ahead of the one streaming, so the GPU never waits between requests, and asks Ollama to keep the model loaded for 10 minutes (`keep_alive`). If you also add `Environment="OLLAMA_NUM_PARALLEL=4"` to the same `[Service]` block, Lambë sees the replies stream side by side, raises its concurrency up to 8 and splits the visible screen across the slots. Without it, Lambë stays at 1 request at a time. The learned concurrency is shared by every tab and kept for the same 10 minutes after the last reply, then Lambë starts again from 1.

## YouTube captions

Turn on **YouTube** in the settings first: Chrome asks for access to `https://www.youtube.com/*`. On a watch page, Lambë then adds a button to the player controls, left of the subtitles button. Click it to show the captions translated into the target language, in an overlay styled like YouTube's own captions; the native captions are hidden and turned on if they were off. Click again for the native captions as you found them, from memory and with no request; once more and the translation is back, also with no request. Turning the subtitles off in the player turns Lambë off too. Lambë reads the track the player itself loads and asks the model only a few sentences ahead of the playhead, so seeking and in app navigation work without a reload. A track already in the target language is shown as is, with no request.

## Privacy and permissions

Lambë asks for the least it needs and requests the rest when you turn on a feature. What it stores, where data goes and how to delete it are in the [privacy policy](docs/privacy-policy.md).

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

## Development

You need Node 24.20 or newer (`.nvmrc`), pnpm 11 (`packageManager`) and Bun 1.4.0 for tests and scripts (`.bun-version`, also read by CI).

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

```text
apps/extension/         the WXT extension: background worker, page and YouTube scripts,
                        options page (React), bubble, locales (en, fr), proof pages
packages/translation/   the framework free engine: segmentation, prompts, batching, queue,
                        cache policy, providers, DOM and YouTube adapters, fixtures
packages/kernel/        Result, Option and value objects, shared by the other packages
tooling/                Biome plugins and the CI scripts (tooling/ci/)
docs/                   guides, privacy policy, store listing, design and plans
```

**Fixtures.** `packages/translation/fixtures` holds saved pages for the DOM tests and the browser proof. `github-fork-a-repo.html` is GitHub Docs content under CC BY 4.0; its source and the changes made are listed in `packages/translation/fixtures/README.md`. `apps/extension/proof` holds `proof.html` (the fixture in 390, 768 and 1440 px frames) and `strict-csp.html`, served with a strict `Content-Security-Policy`. What each plan was measured to do in a real browser is in [docs/verification.md](docs/verification.md).

## Chrome Web Store

- Listing text, single purpose, permission justifications and data disclosures: [`docs/store/listing.en.md`](docs/store/listing.en.md) and [`docs/store/listing.fr.md`](docs/store/listing.fr.md). A test checks that the short descriptions fit 132 characters and that every manifest permission is justified, no more.
- Promo tile and screenshots: `docs/store/assets/`.
- Privacy policy: [`docs/privacy-policy.md`](docs/privacy-policy.md). The listing and the settings link to it on GitHub.
- Store build: `pnpm zip`, then `LAMBE_STORE=1 pnpm --filter @lambe/extension check:manifest` to check it has no `key`, no static content script and exactly the narrow permissions.
- Automatic publishing and its one time setup: [`docs/store/publishing.md`](docs/store/publishing.md).

## Docs

[docs/README.md](docs/README.md) lists every page. Where to start:

| Read | When you want to |
|---|---|
| [local AI guide](docs/local-ai.md) ([fr](docs/local-ai.fr.md)) | run a model on your computer and connect Lambë to it, no coding needed |
| [privacy policy](docs/privacy-policy.md) | know what Lambë handles, where it goes and how to delete it |
| [verification](docs/verification.md) | see what each plan was measured to do in a real browser |
| [releases](docs/maintenance/releases.md) | understand how a merged PR becomes a release on the store |
| [store publishing](docs/store/publishing.md) | set up the Chrome Web Store submission |

## Releases

Versions come from Conventional Commits through [release-please](https://github.com/googleapis/release-please). Work lands on `develop`; release-please keeps a release PR against it, and merging that PR tags the release, moves `main` to it, attaches the unpacked and store zips to the GitHub Release and submits the store zip to the Chrome Web Store. Lambë stays in `0.x`, every release is a pre-release, and nobody sets a version or a tag by hand. The whole flow and the repository settings are in [docs/maintenance/releases.md](docs/maintenance/releases.md).

## Contributing

Issues and pull requests are welcome, in English or French. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: branch from `develop`, run `pnpm verify`, check UI changes in a real browser, and write Conventional Commits. Report a vulnerability privately through [SECURITY.md](SECURITY.md), and see the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE). Lambë is free and open source: use it, fork it, ship it.

<sub>Why the name: Lambë is Quenya for "tongue, language"; the bubble glyph is the tengwa of the same name.</sub>
