import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { ViewState } from "@lambe/translation/application/view-state";
import { parseMessagesFile } from "@wxt-dev/i18n/build";

interface CatalogMessage {
  text: string;
  names: string[];
}

type EngineErrorCode = Extract<ViewState, { kind: "error" }>["error"]["code"];

const ENGINE_CODES = {
  PROVIDER_UNREACHABLE: true,
  PROVIDER_FORBIDDEN_ORIGIN: true,
  PROVIDER_MODEL_MISSING: true,
  PROVIDER_BAD_RESPONSE: true,
  PROVIDER_RATE_LIMITED: true,
  PROVIDER_TIMEOUT: true,
  REQUEST_CANCELLED: true,
  PROVIDER_UNAUTHORIZED: true,
  NO_CAPTIONS: true,
  CONSENT_REQUIRED: true,
} satisfies Record<EngineErrorCode, true>;

const APP_CODES = [
  "PAGE_UNAVAILABLE",
  "SETTINGS_INVALID",
  "SETTINGS_FROM_NEWER_VERSION",
  "UNKNOWN",
];

const ERROR_CODES = [...Object.keys(ENGINE_CODES), ...APP_CODES];

const DASH_PUNCTUATION = /[\u2013\u2014]|\s-\s/;

async function catalog(locale: string): Promise<Map<string, CatalogMessage>> {
  const messages = await parseMessagesFile(resolve(import.meta.dir, `../../locales/${locale}.yml`));
  const entries = messages
    .filter((message) => !message.key.some((part) => part.startsWith("@@")))
    .map((message): [string, CatalogMessage] => {
      const text =
        message.type === "plural" ? Object.values(message.plurals).join("|") : message.message;

      return [message.key.join("."), { text, names: [...message.namedSubstitutions].sort() }];
    });

  return new Map(entries);
}

describe("message catalog", () => {
  test("fr_has_exactly_the_keys_of_en", async () => {
    const en = await catalog("en");
    const fr = await catalog("fr");

    expect([...fr.keys()].sort()).toEqual([...en.keys()].sort());
  });

  test("placeholders_match_between_en_and_fr", async () => {
    const en = await catalog("en");
    const fr = await catalog("fr");

    for (const [key, message] of en) {
      expect({ key, names: fr.get(key)?.names }).toEqual({ key, names: message.names });
    }
  });

  test("every_error_code_has_a_message", async () => {
    const en = await catalog("en");

    const missing = ERROR_CODES.filter((code) => !en.get(`error.${code}`)?.text);

    expect(missing).toEqual([]);
  });

  test("no_message_contains_a_dash_used_as_punctuation", async () => {
    const all = [...(await catalog("en")), ...(await catalog("fr"))];

    const dashed = all.filter(([, message]) => DASH_PUNCTUATION.test(message.text));

    expect(dashed.map(([key]) => key)).toEqual([]);
  });
});
