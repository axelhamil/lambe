# Chrome Web Store listing (English)

Text to paste in the developer dashboard. Each `##` section matches a dashboard field. The only value to fill by hand is `<PRIVACY_POLICY_URL>`: the public URL of `docs/privacy-policy.md` once the repository is published.

## Name

Lambë

## Short description

Translate web pages and YouTube captions in place with your own model: local Ollama or any OpenAI-compatible server.

## Detailed description

Lambë translates the page you are reading without leaving it. The text is replaced in place, code blocks stay untouched, and technical terms stay the way professionals write them. One click brings the original back at once, from memory.

Lambë uses the model you choose. Out of the box it talks to Ollama on your own computer, so the text never leaves your machine. You can also point it to any OpenAI-compatible server with an API key.

What it does:

- Translates the visible part of the page first, then what you scroll to.
- Toggles between the translation and the original with a click on the bubble, the toolbar icon or Alt+L, with no new request.
- Double click on the bubble translates again and refreshes the cache.
- Translates YouTube captions in the player, a few sentences ahead of the playhead, styled like the native captions.
- Keeps translations on your device so pages you revisit open at once.

Settings:

- Provider: Ollama or an OpenAI-compatible server, model picker and a connection test.
- Translation: the language you read in.
- Sites: show the bubble on every site, or translate some sites automatically and hide the bubble on others.
- YouTube: turn translated captions on or off.
- Prompt: edit the guidelines the model follows.
- Cache: see its size and clear it.
- Shortcut: see and change the Alt+L binding.
- Privacy: read what leaves your browser and withdraw your consent.

Privacy first: Lambë asks for your consent before it sends any text. Page text and captions go only to the provider you configure. Nothing goes to the developer, there are no analytics and no remote code. Lambë asks for access to a site only when you turn on a feature that needs it.

The interface is available in English and French.

## Category

Tools

## Language

English

## Single purpose

Lambë translates the text of the web page or YouTube video the user is viewing, in place, with a language model the user configures, and restores the original on demand.

## Permission justifications

### `storage`

Stores the user's settings (provider, target language, site rules, prompt guidelines, consent date) and the optional API key of the provider, on the device only.

### `unlimitedStorage`

Keeps the translation cache on the device so pages and captions the user revisits are shown at once without a new request. The cache can grow past the default quota on long pages; the user can see its size and clear it in the settings.

### `activeTab`

When the user clicks the toolbar icon or presses Alt+L, gives temporary access to the current tab only, so Lambë can translate that page without a permanent host permission.

### `scripting`

Injects the translation script into the current tab after that click, and registers it on the sites the user explicitly allowed (bubble on every site, automatic translation of a site, YouTube captions).

### `http://localhost/*`

Reaches Ollama, the default provider, which runs on the user's own computer on any port of localhost.

### `http://127.0.0.1/*`

Same as localhost, for users whose Ollama address is written as 127.0.0.1.

### `https://*/*`

Optional, requested at click time only. Granted origins are the sites the user chooses in the settings (bubble everywhere, a site translated automatically, YouTube) and the address of a remote OpenAI-compatible provider the user enters. Nothing is requested at install.

### `http://*/*`

Optional, requested at click time only, for the same choices as above on sites or providers served over plain http, such as a model server on the local network.

## Remote code

No, I am not using remote code. Every script ships in the package.

## Data usage

Data types to check in the dashboard:

- Website content: the text of the pages the user asks to translate and the captions of the YouTube videos the user translates. Sent only to the provider the user configured, to get the translation back.
- Authentication information: the optional API key of an OpenAI-compatible provider. Stored on the device and sent only to that provider in the `Authorization` header.

No other type is collected. Settings and the translation cache stay on the device. Nothing is sent to the developer, there are no analytics, no ads and no tracking. Before the first translation, an onboarding screen explains what is sent and where, and asks for consent; the user can withdraw it at any time in the settings.

Certifications to check:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Privacy policy URL

`<PRIVACY_POLICY_URL>`

Manual step: publish `docs/privacy-policy.md` (for example on the repository page) and paste its public URL here and in the dashboard.

## Assets

- Store icon: `apps/extension/public/icon/128.png` (128x128).
- Small promo tile: `docs/store/assets/promo-440x280.png` (440x280), rendered by `bun apps/extension/scripts/render-promo.ts`.
- Screenshots: 1280x800, to capture from a real session (options page, a translated page, YouTube captions).
