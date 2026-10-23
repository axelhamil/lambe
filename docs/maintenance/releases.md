# Releases of Lambë

How `axelhamil/lambe` publishes a release, from a merged PR to the Chrome Web Store. A fork runs none of this: `release` and `sync-develop` are keyed on `github.repository` and are skipped anywhere else.

## Branches

- Work lands on `develop` through PRs from `feat/`, `fix/`, `refactor/`, `chore/` and `docs/` branches.
- `main` moves only through PRs and the release: it always points at the latest release.
- `sync-develop` merges `main` back into `develop` after every push to `main`, with the App token, so `ci` runs on the merged `develop`.

## The release flow

The `release` workflow runs on every push to `develop`, only when `github.repository` is `axelhamil/lambe`:

1. [release-please](https://github.com/googleapis/release-please) keeps a release PR against `develop` that bumps the version in `package.json`, `apps/extension/package.json` (hence the manifest version) and `.release-please-manifest.json`, and writes `CHANGELOG.md` from the Conventional Commits. Its checks are the last proof before a release.
2. Merging it tags the release (`v0.1.0`, no component in the tag) and publishes the GitHub Release as a pre-release. release-please writes the release notes alone.
3. The workflow then moves `main` to the release with the App token.
4. The `publish` job checks out the tag, runs `pnpm verify` and `tooling/ci/build-zips.sh`, which builds two zips and checks both manifests with `check:manifest`:
   - `*-chrome.zip`, a loadable unpacked build that keeps its `key`, so its id is `dccgcoohbalgmgkflpndagoallbcgnch`;
   - `*-chrome-store.zip`, built with `LAMBE_STORE=1`, which drops the `key` the store rejects; the store guard checks it has no `key`, no static content script, and exactly the narrow `permissions`, `host_permissions` and `optional_host_permissions`.
5. Both zips are attached to the GitHub Release. Then `tooling/ci/store-secrets.sh` checks the store secrets: when one is missing, the submit is skipped with a notice and the release keeps its zips. Otherwise `tooling/ci/publish-store.sh` submits the store zip with `wxt submit` over the CWS API v2, with `CHROME_PUBLISH_TYPE: DEFAULT_PUBLISH`: it goes live as soon as the review passes.

**Run workflow** on `release` with an existing tag (for example `v0.2.0`) reruns only the publish: it rebuilds that tag, replaces the release assets and submits again. Publishes run one at a time. The one time store setup, the first upload by hand and the retry rules are in [`../store/publishing.md`](../store/publishing.md).

Never set a version, edit `.release-please-manifest.json`, a `version` field or `CHANGELOG.md`, or create a tag by hand. The project stays in `0.x`, every release marked as a pre-release, until the maintainer decides on `1.0.0`.

## What each commit releases

| Commit | While in `0.x` |
|---|---|
| breaking (`!` or a `BREAKING CHANGE:` footer, which must say how to migrate) | bumps the minor |
| `feat`, `fix` | bump the patch |
| `chore`, `ci`, `docs`, `refactor`, `test` | no release of their own |

Release notes open with the breaking changes, then features, fixes, performance, documentation and reverts. `chore`, `ci`, `refactor` and `test` stay out of them (`release-please-config.json`). The first release is `0.1.0`.

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci` | every PR, push to `main` and `develop`; a newer push cancels the running check of its PR or of `develop`, never of `main` | `pnpm install --frozen-lockfile`, `pnpm verify`, the extension build and `check:manifest` (the dev manifest keeps its `key`). `ci-ok` sums up the result: it is the single required check. |
| `release` | push to `develop`, upstream only; **Run workflow** with a tag | release-please, then `main` moved to a new release, then the zips and the store submit ([above](#the-release-flow)). |
| `sync-develop` | push to `main`, upstream only, when `BOT_CLIENT_ID` is set | Runs `tooling/ci/sync-develop.sh`: merges `main` into `develop` with the App token. |
| Dependabot | weekly | One grouped PR against `develop` for the pinned GitHub Actions (`ci:`), one for npm minor and patch updates (`chore(deps):`), each only for versions released at least 7 days ago. |

Workflows only chain one line calls: any logic lives in a script under `tooling/ci/`. Every action is pinned to a full commit SHA with its tag in a trailing comment, and Dependabot keeps both current. Each workflow grants `GITHUB_TOKEN` `contents: read` at most, or nothing where it uses the App token alone; `actions/checkout` keeps its token only in the jobs that push (`release`, `sync-develop`). `release` and `sync-develop` take what the App installation grants, since what they push may change `.github/workflows/`; `.github/zizmor.yml` records these two exceptions. Lint the workflows with `nix run nixpkgs#actionlint` and `nix run nixpkgs#zizmor -- .github/`.

## Repository settings

Done once by the maintainer, in the repository settings on GitHub:

1. **Bot GitHub App.** [Create a GitHub App](https://github.com/settings/apps/new) with webhooks off and the repository permissions **Contents**, **Pull requests** and **Issues** (release-please labels) read and write, plus **Workflows** read and write so a release that changes `.github/workflows/` can still move `main`. Generate a private key and install the App on `axelhamil/lambe`. PRs opened with `GITHUB_TOKEN` trigger no workflow, hence the App.
2. **Variable and secret.** In **Secrets and variables**, **Actions**: the repository variable `BOT_CLIENT_ID` (the App's client ID) and the secret `BOT_PRIVATE_KEY` (its private key). Until `BOT_CLIENT_ID` is set, `sync-develop` is skipped and `release` fails at its token step.
3. **Ruleset on `main`.** Require a pull request and the `ci-ok` status check, block deletions and force pushes, and add the bot App to the bypass list so `release` can move `main` to a release.
4. **Ruleset on `develop`.** Block deletions and force pushes, so "Automatically delete head branches" never deletes `develop` when a `develop` into `main` PR merges. Requiring `ci-ok` on PRs into `develop` is recommended; the App then needs to be in its bypass list too, since `sync-develop` pushes the merge directly.
5. **Default branch** stays `main`: it always holds the latest release, and the settings page links to the docs on `main`. Contributors pick `develop` as the base of their PR ([CONTRIBUTING.md](../../CONTRIBUTING.md)). Dependabot and **Run workflow** read the workflows of the default branch, so they start once a first release reached `main`.
6. **Chrome Web Store secrets** `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` and `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`, after the first upload by hand ([`../store/publishing.md`](../store/publishing.md)).
7. **Private vulnerability reporting** on, in **Security**, so [SECURITY.md](../../SECURITY.md) works.
