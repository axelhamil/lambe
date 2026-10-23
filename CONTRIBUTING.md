# Contributing

Thanks for helping improve Lambë, the Chrome extension that translates pages and YouTube captions in place with the model you choose.

- To try Lambë first, follow the [README](README.md).
- The design and the plans behind each feature are in [`docs/superpowers/`](docs/superpowers/); [docs/README.md](docs/README.md) lists every page.

## Setup

Fork the repository on GitHub, clone your fork, then:

```sh
nvm use            # Node 24.22.1 from .nvmrc
corepack enable    # pnpm 12 from packageManager
pnpm install       # also installs the husky hooks
pnpm verify
```

You need Node 24.22.1 or newer, pnpm 12 and Bun 1.4.4 (`.bun-version`) for the tests and scripts. To try a change in the browser, build with `pnpm --filter @lambe/extension build` and load `apps/extension/.output/chrome-mv3` unpacked in Chrome or Brave, with [Ollama](https://ollama.com) running locally ([docs/local-ai.md](docs/local-ai.md)).

## Before a PR

| Command | When |
|---|---|
| `pnpm verify` | always: Biome, type check, Bun tests, knip, jscpd, dependency-cruiser; CI runs the same |
| `pnpm --filter @lambe/extension build` and `check:manifest` | always: CI runs both |
| A real browser run (Chrome or Brave), console clean | after touching the UI, the side tab, the page translation or YouTube: say in the PR what you checked, with screenshots |
| `LAMBE_STORE=1 pnpm --filter @lambe/extension check:manifest` after `pnpm zip` | after touching the manifest or the permissions |
| `nix run nixpkgs#actionlint` and `nix run nixpkgs#zizmor -- .github/` | after touching `.github/` |

Rules the review checks:

- **Every user facing string** goes in `apps/extension/locales/en.yml` and `fr.yml` (French with its accents) through the existing i18n; a test fails when the two catalogs drift.
- **Tests** run on Bun (`bun:test`, happy-dom) and check behavior, one test per rule; a fixed bug comes with the test that reproduces it.
- **Code** in English, TypeScript strict, no comments, no `as` casts and no non-null `!`: narrow with guards or Zod. No em dash or en dash anywhere, code, UI or docs.
- **Privacy**: page text goes only to the provider the user configured. Never add analytics, remote code or a call to a third party translator, in the extension or in its tests (tests use a fake server or local Ollama).
- **Permissions** stay as narrow as they are: a new one needs its justification in `docs/store/listing.en.md` and `listing.fr.md`, and the manifest test fails without it.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): they drive releases through release-please, and the `commit-msg` hook checks them with commitlint (lowercase subject, at most 72 characters). A breaking change (`!` or a `BREAKING CHANGE:` footer) must say how to migrate. Never set a version, edit `CHANGELOG.md` or create a tag by hand. What each type releases is in [docs/maintenance/releases.md](docs/maintenance/releases.md#what-each-commit-releases).

```text
feat(extension): translate the page title
fix(translation): keep inline code untouched in lists
```

Never bypass a hook with `--no-verify`: fix what it reports.

## Pull requests

1. Branch from `develop` (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/` plus a slug).
2. Run the commands above.
3. Open the PR from your fork against `develop`. CI runs `pnpm verify`, the build and the manifest check; `ci-ok` must be green.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
