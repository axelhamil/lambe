# Fixtures

Test pages for the DOM adapters in `src/infrastructure/dom`.

- `github-fork-a-repo.html`: GitHub Docs content, licensed CC BY 4.0. Source: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo (served at /en/pull-requests/how-tos/work-with-forks/fork-a-repo), captured on 2026-10-18. Scripts, iframes, preload, modulepreload and prefetch links and tracking images removed; stylesheet links made absolute.
- `react-like-page.html`: static tree whose inline script keeps references to every text node of `#app` and replaces them on `window.__frame.rerender()`, like keyed reconciliation. Holds the highlighted code comments.
- `spa-feed.html`: empty `#feed` filled by `window.__append(n)` and trimmed by `window.__trim()`.
- `repo-blob-readme.html`: hand-written page shaped like a code host's blob view of a README (global header, repo tabs, file tree, file header buttons, `article.markdown-body`). Generic names, no real branding or assets.

Caption tracks for the YouTube adapters in `src/infrastructure/youtube`, in `youtube/`. Each body is the player's own `/api/timedtext` json3 response, read with CDP Network from a headless Brave loading the public watch page on 2026-10-23, then trimmed to the events of the first 60 s of captions (header keys kept). The captions belong to their authors and serve as test data only.

- `youtube/manual-en.json3.json`: manual English track of `iG9CE55wbtY` ("Do schools kill creativity?", Sir Ken Robinson, TED). Query: `v=iG9CE55wbtY&lang=en&fmt=json3`.
- `youtube/asr-en.json3.json`: automatic English track of `iG9CE55wbtY`. Query: `v=iG9CE55wbtY&lang=en&kind=asr&fmt=json3`.
- `youtube/asr-fr.json3.json`: automatic French track of `8g5Aif1khO8` ("CONFÉRENCE : C'est quoi un DevOps ?", Florian Dambrine), which has automatic captions only. Query: `v=8g5Aif1khO8&lang=fr&kind=asr&fmt=json3`.
