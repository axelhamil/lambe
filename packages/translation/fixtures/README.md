# Fixtures

Test pages for the DOM adapters in `src/infrastructure/dom`.

- `github-fork-a-repo.html`: GitHub Docs content, licensed CC BY 4.0. Source: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo (served at /en/pull-requests/how-tos/work-with-forks/fork-a-repo), captured on 2026-10-18. Scripts, iframes, preload, modulepreload and prefetch links and tracking images removed; stylesheet links made absolute.
- `react-like-page.html`: static tree whose inline script keeps references to every text node of `#app` and replaces them on `window.__frame.rerender()`, like keyed reconciliation. Holds the highlighted code comments.
- `spa-feed.html`: empty `#feed` filled by `window.__append(n)` and trimmed by `window.__trim()`.
- `repo-blob-readme.html`: hand-written page shaped like a code host's blob view of a README (global header, repo tabs, file tree, file header buttons, `article.markdown-body`). Generic names, no real branding or assets.
