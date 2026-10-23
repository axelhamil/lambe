import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import type { BatchRequest } from "@lambe/translation/application/batch-translation.service";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { SecretsStore } from "../settings/secrets-store";
import { defaultSettings, type Settings } from "../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../settings/settings-store";
import { fakeStorageArea } from "../settings/testing/fake-storage-area";
import { WorkerHost, workerBuilder } from "./worker-host";

const SECRETS_KEY = "lambe:secrets";

interface SentRequest {
  url: string;
  authorization: string | null;
  model: unknown;
}

const request: BatchRequest = {
  segments: [{ id: "0", markup: "Hello" }],
  source: Option.none(),
  target: LanguageCode.create("fr").getValue(),
  brief: {
    kind: "page",
    host: "x.test",
    url: "https://x.test/",
    title: "",
    description: "",
    headings: [],
    sourceLanguage: Option.none(),
  },
  cachePolicy: "use",
};

const consented = (change: Partial<Settings> = {}): Settings => ({
  ...defaultSettings("en"),
  consentAt: 1,
  ...change,
});

const modelOf = (body: unknown): unknown => {
  if (typeof body !== "string") return undefined;

  const parsed: unknown = JSON.parse(body);

  return typeof parsed === "object" && parsed !== null && "model" in parsed
    ? parsed.model
    : undefined;
};

function hostOver(initial: Record<string, unknown>) {
  const storage = fakeStorageArea(initial);
  const sent: SentRequest[] = [];
  const build = workerBuilder({
    fetch: async (input, init) => {
      sent.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        model: modelOf(init?.body),
      });

      return new Response("", { status: 500 });
    },
    cache: { getMany: async () => new Map(), setMany: async () => undefined },
    origin: "chrome-extension://test",
    now: () => 0,
    log: { debug: () => undefined },
  });
  const host = new WorkerHost({
    settings: new SettingsStore(storage.area, "en"),
    secrets: new SecretsStore(storage.area),
    build,
  });
  const translateOnce = async (): Promise<SentRequest | undefined> => {
    const before = sent.length;
    const service = await host.service();

    if (service.isSuccess) await service.getValue().translate(request);

    return sent[before];
  };

  return { storage, host, sent, translateOnce };
}

describe("WorkerHost", () => {
  test("translate_before_consent_never_calls_the_provider", async () => {
    const given = hostOver({ [SETTINGS_KEY]: defaultSettings("en") });

    const service = await given.host.service();

    expect(service.isFailure).toBe(true);
    expect(service.isFailure && service.getError().code).toBe("CONSENT_REQUIRED");
    expect(given.sent).toEqual([]);
  });

  test("settings_change_rebuilds_the_provider_for_the_next_request", async () => {
    const given = hostOver({ [SETTINGS_KEY]: consented() });

    const first = await given.translateOnce();
    const next = consented();
    given.storage.changeFromElsewhere({
      [SETTINGS_KEY]: { newValue: { ...next, provider: { ...next.provider, model: "qwen3:8b" } } },
    });
    const second = await given.translateOnce();

    expect(first?.model).toBe("translategemma:12b");
    expect(second?.model).toBe("qwen3:8b");
  });

  test("openai_kind_builds_the_openai_adapter_with_the_stored_key", async () => {
    const settings = consented();
    const given = hostOver({
      [SETTINGS_KEY]: {
        ...settings,
        provider: {
          ...settings.provider,
          kind: "openai-compatible",
          baseUrl: "https://api.example.test/v1/",
          model: "gpt-test",
        },
      },
      [SECRETS_KEY]: { apiKey: "sk-stored" },
    });

    const sent = await given.translateOnce();

    expect(sent?.url).toBe("https://api.example.test/v1/chat/completions");
    expect(sent?.authorization).toBe("Bearer sk-stored");
    expect(sent?.model).toBe("gpt-test");
  });

  test("api_key_change_rebuilds_the_provider", async () => {
    const settings = consented();
    const given = hostOver({
      [SETTINGS_KEY]: {
        ...settings,
        provider: { ...settings.provider, kind: "openai-compatible", model: "gpt-test" },
      },
      [SECRETS_KEY]: { apiKey: "sk-old" },
    });

    const first = await given.translateOnce();
    given.storage.changeFromElsewhere({ [SECRETS_KEY]: { newValue: { apiKey: "sk-new" } } });
    const second = await given.translateOnce();

    expect(first?.authorization).toBe("Bearer sk-old");
    expect(second?.authorization).toBe("Bearer sk-new");
  });
});
