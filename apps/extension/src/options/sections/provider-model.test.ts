import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import type { HostAccess } from "../../access/host-access";
import { renderError } from "../../i18n/render-error";
import { SecretsStore } from "../../settings/secrets-store";
import { defaultSettings } from "../../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../../settings/settings-store";
import { fakeStorageArea } from "../../settings/testing/fake-storage-area";
import { type ProviderDraft, providerDraft, providerModel, switchKind } from "./provider-model";

const EXTENSION_ID = "lambeextensionid";

type Route = (url: string, init?: RequestInit) => Response;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ollamaTags = (...names: string[]): Route => {
  return () => json({ models: names.map((name) => ({ name })) });
};

const unreachable: Route = () => {
  throw new TypeError("Failed to fetch");
};

function setup(route: Route = ollamaTags(), grants = true) {
  const storage = fakeStorageArea({ [SETTINGS_KEY]: defaultSettings("en") });
  const store = new SettingsStore(storage.area, "en");
  const requested: string[][] = [];
  const hostAccess: HostAccess = {
    granted: async () => [],
    request: async (origins) => {
      requested.push(origins);

      return grants;
    },
    remove: async () => true,
  };
  const model = providerModel({
    extensionId: EXTENSION_ID,
    fetch: async (input, init) => route(String(input), init),
    hostAccess,
    secrets: new SecretsStore(storage.area),
    update: (change) => store.update(change),
  });

  return { model, store, storage, requested };
}

const ollamaDraft = (model: string): ProviderDraft => ({
  kind: "ollama",
  baseUrl: "http://localhost:11434",
  model,
  apiKey: "",
});

const cloudDraft: ProviderDraft = {
  kind: "openai-compatible",
  baseUrl: "https://api.example.com/v1",
  model: "gpt-mini",
  apiKey: "sk-secret",
};

describe("provider model", () => {
  test("test_connection_lists_models_and_flags_a_missing_one", async () => {
    const { model } = setup(ollamaTags("gemma3:latest", "translategemma:12b"));

    const missing = await model.testConnection(ollamaDraft("qwen3:8b"));
    const implicitLatest = await model.testConnection(ollamaDraft("gemma3"));

    expect(missing).toEqual({
      kind: "ok",
      models: ["gemma3:latest", "translategemma:12b"],
      modelInstalled: false,
    });
    expect(implicitLatest).toMatchObject({ kind: "ok", modelInstalled: true });
  });

  test("forbidden_origin_returns_fixes_for_the_three_systems_with_the_runtime_id", async () => {
    const { model } = setup(() => new Response("", { status: 403 }));

    const view = await model.testConnection(ollamaDraft("gemma3"));

    if (view.kind !== "error") throw new Error(`expected an error, got ${view.kind}`);

    const copyable = view.fix.map(({ os, steps }) => ({
      os,
      texts: steps.flatMap((step) =>
        step.kind === "command" ? [step.text] : step.line.map((line) => [line]).unwrapOr([]),
      ),
    }));

    expect(view.error.code).toBe("PROVIDER_FORBIDDEN_ORIGIN");
    expect(copyable.map(({ os }) => os)).toEqual(["linux", "macos", "windows"]);
    expect(
      copyable.every(({ texts }) =>
        texts.some((text) => text.includes(`chrome-extension://${EXTENSION_ID}`)),
      ),
    ).toBe(true);
    expect(copyable[0]?.texts).toContain(
      `Environment="OLLAMA_ORIGINS=chrome-extension://${EXTENSION_ID}"`,
    );
  });

  test("unreachable_error_carries_the_base_url", async () => {
    const { model } = setup(unreachable);

    const view = await model.testConnection(ollamaDraft("gemma3"));

    expect(view).toMatchObject({
      kind: "error",
      error: { code: "PROVIDER_UNREACHABLE", params: { baseUrl: "http://localhost:11434" } },
      fix: [],
    });
  });

  test("unauthorized_error_hints_the_api_key", async () => {
    const { model } = setup(() => json({ error: "bad key" }, 401));

    const view = await model.testConnection(cloudDraft);

    if (view.kind !== "error") throw new Error(`expected an error, got ${view.kind}`);

    expect(view.error.code).toBe("PROVIDER_UNAUTHORIZED");
    expect(renderError(view.error)).toContain("API key");
    expect(JSON.stringify(view)).not.toContain(cloudDraft.apiKey);
  });

  test("saving_a_non_local_base_url_requests_its_origin_first", async () => {
    const { model, store, requested } = setup();

    const saved = await model.save(cloudDraft);
    const { provider } = (await store.load()).settings;

    expect(saved.isSuccess).toBe(true);
    expect(requested).toEqual([["https://api.example.com/*"]]);
    expect(provider).toMatchObject({
      kind: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-mini",
    });
  });

  test("denied_origin_prompt_keeps_the_old_provider", async () => {
    const { model, store, storage } = setup(ollamaTags(), false);

    const saved = await model.save(cloudDraft);

    expect(saved.isFailure).toBe(true);
    expect(saved.isFailure && saved.getError()).toEqual({
      code: "ORIGIN_DENIED",
      origin: "https://api.example.com/*",
    });
    expect((await store.load()).settings.provider).toEqual(defaultSettings("en").provider);
    expect(storage.stored("lambe:secrets")).toBeUndefined();
  });

  test("api_key_is_saved_to_secrets_not_to_settings", async () => {
    const { model, storage } = setup();

    await model.save(cloudDraft);

    expect(await new SecretsStore(storage.area).apiKey()).toEqual(Option.some("sk-secret"));
    expect(JSON.stringify(storage.stored(SETTINGS_KEY))).not.toContain("sk-secret");
  });

  test("switching_kind_resets_the_model_and_default_base_url", () => {
    const ollama = providerDraft(defaultSettings("en").provider, Option.none());

    const cloud = switchKind({ ...ollama, model: "gemma3" }, "openai-compatible");
    const back = switchKind(cloud, "ollama");

    expect(cloud).toEqual({
      kind: "openai-compatible",
      baseUrl: "http://localhost:1234/v1",
      model: "",
      apiKey: "",
    });
    expect(back).toEqual(ollama);
  });
});
