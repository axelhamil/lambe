# Verification

What each shipped plan was measured to do in a real browser, with the numbers. The [README](../README.md) says what Lambë does; this page holds the proof.

## Plan 1 verification

Measured on 2026-10-18 in headless Brave over CDP, `translategemma:12b` on local Ollama, target `fr`, cache cleared before each frame, on `proof.html` with the plan 1 build, which ran in every frame (frames of 375, 753 and 1425 px of layout width once the scrollbar is removed).

| | 390 px | 768 px | 1440 px |
| --- | --- | --- | --- |
| First translated paragraph | 3.6 s | 4.0 s | 9.9 s |
| Visible screen translated | 6.9 s | 8.3 s | 17.0 s |
| Requests for the first screen | 6 | 8 | 14 |
| Requests after 3 screens of scroll | 15 | 16 | 21 |
| Blocks translated after 3 screens | 40 of 253 | 55 of 253 | 91 of 253 |

- Error path: against a server answering 403, the bubble (now the side tab) showed the error state, the tooltip holds `OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch`, the page is untouched and exactly 1 request is sent; the count is still 1 after 18 s.
- Code: the 36 `pre`, `code` and `kbd` elements are byte for byte identical after translation in every frame.
- Jargon: `fourchette` appears 0 times. `fork` survives in 16 of 17, 16 of 21 and 24 of 26 translated blocks that contain it; the other blocks say "copie". `pull request` survives in 1 of 6 blocks; the others say "demande de fusion" or "demande de tirage". A glossary is planned for Plan 2.
- Toggle (1440 px frame): the original comes back with `documentElement.outerHTML` identical to the capture taken before translating, with 0 requests, in 1 DOM batch of under 1 ms. The first DOM change lands 0.4 ms after the pointer up: a single click acts at once, and a second click within 250 ms turns it into a double click. Toggling again restores the translated page identically, also with 0 requests.
- Revisit (1440 px frame): with headings that end in an empty anchor now cached, the first screen takes 10 requests instead of 14. The next visit sends 1 request, for a navigation item the first visit never reached, and the one after sends 0.
- Double click (1440 px frame): 10 new requests; 54 cache entries are overwritten and the page never shows the stale values planted in them.
- Bubble (plan 1, since replaced by the side tab): at every width it snapped to the nearest edge, clamped to the bottom edge and flipped its tail.
- Side tab (re-measured on 2026-10-23 on a local fixture): 24 x 36 px at rest and 32 x 36 px on hover, its right edge equal to `clientWidth` with or without a visible scrollbar; a drag moves it only vertically and clamps it to `height - 36 - 8`.
- Strict CSP (`default-src 'self'; style-src 'self'; script-src 'self'`, re-measured on 2026-10-23 with the side tab on a local fixture): an inline style is blocked, yet the tab renders as on the same page without CSP (24 x 36 px, fixed, same fill, radius and shadow, 32 px on hover), with 0 CSP violations from the extension, and the page translates in 3.2 s.
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
