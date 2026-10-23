# Publishing to the Chrome Web Store

Every release on `main` is submitted to the Chrome Web Store by `.github/workflows/release.yml` and goes live as soon as the review passes. This page lists the one time setup.

## 1. First upload, by hand

The API only updates an item that already exists, so the first version goes through the [developer dashboard](https://chrome.google.com/webstore/devconsole).

1. Download the `*-chrome-store.zip` asset of a GitHub release, or build it with `pnpm zip`.
2. In the dashboard, click **New item** and upload the zip.
3. Fill the **Store listing** and **Privacy** tabs from [`listing.en.md`](listing.en.md) and [`listing.fr.md`](listing.fr.md), with the promo tile in `assets/`.
4. Submit for review.

## 2. Extension id and publisher id

- Extension id: the 32 letter id shown on the item page in the dashboard and in its store URL.
- Publisher id: in the dashboard, **Publisher**, **Settings** (per the [API guide](https://developer.chrome.com/docs/webstore/using-api)).

## 3. Service account

Follow [Use service accounts](https://developer.chrome.com/docs/webstore/service-accounts).

1. In [Google Cloud console](https://console.cloud.google.com), create or pick a project.
2. Enable the **Chrome Web Store API** for that project.
3. Create a service account. It needs no IAM role.
4. Open the service account, **Keys**, **Add key**, **JSON**. Keep the file out of the repository.
5. In the developer dashboard, **Account** section, add the service account email (`client_email` in the JSON). A publisher accepts one service account.

## 4. GitHub secrets

Repository **Settings**, **Secrets and variables**, **Actions**:

| Secret | Value |
| --- | --- |
| `CHROME_EXTENSION_ID` | Extension id from step 2 |
| `CHROME_PUBLISHER_ID` | Publisher id from step 2 |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | `client_email` of the JSON key |
| `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` of the JSON key, from `-----BEGIN` to `END PRIVATE KEY-----`; literal `\n` sequences are turned into line breaks by the workflow |

`BOT_CLIENT_ID` and `BOT_PRIVATE_KEY` (the GitHub App that cuts releases) are already required by release-please. While any `CHROME_*` secret is missing, the publish step is skipped with a notice and the release still gets its zips. Delete the JSON key file once the secrets are set.

## 5. How a release flows

1. Merge Conventional Commits (`feat:`, `fix:`) into `main`.
2. release-please opens or updates a release PR with the next version and changelog.
3. Merging that PR tags the release.
4. The `publish` job checks out the tag, runs `pnpm verify`, builds `*-chrome.zip` (unpacked, keeps `key`) and `*-chrome-store.zip` (`LAMBE_STORE=1`, no `key`), checks both manifests and attaches the zips to the release.
5. `wxt submit` uploads the store zip over the [CWS API v2](https://developer.chrome.com/docs/webstore/api) with `publishType` `DEFAULT_PUBLISH`: the version is [published right after approval](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish).

Never edit a version or a tag by hand.

## 6. Retry a publish

When the store step fails (secret typo, pending review, outage), rerun it without a new release: **Actions**, **Release**, **Run workflow**, enter the existing tag (for example `v0.2.0`). The job rebuilds that tag, replaces the release assets and submits again. Publishes run one at a time.

A version already accepted by the store cannot be uploaded twice: retry only a tag the store has not taken.

## 7. Ollama and the store id

The store assigns its own id, different from the unpacked dev id derived from the `key` in `wxt.config.ts`. Ollama users of the store build allow it with:

```
OLLAMA_ORIGINS=chrome-extension://<store extension id>
```

Update the README Ollama section with the real id once the item exists.
