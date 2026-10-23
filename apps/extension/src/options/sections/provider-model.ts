import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { ProviderCheckService } from "@lambe/translation/application/provider-check.service";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import type { OllamaConfig } from "@lambe/translation/infrastructure/providers/ollama-provider";
import type { HostAccess } from "../../access/host-access";
import { extensionOriginOf, remotePatternOf, webOriginOf, webUrlOf } from "../../access/web-origin";
import { providerFor } from "../../composition/provider-factory";
import type { SecretsStore } from "../../settings/secrets-store";
import { defaultSettings, type ProviderSettings, type Settings } from "../../settings/settings";
import type { SettingsProblem } from "../../settings/settings-store";
import { type FixGuide, ollamaOriginsFix } from "../ollama-origins-fix";

export type ProviderKind = ProviderSettings["kind"];

export interface ProviderDraft {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type ConnectionView =
  | { kind: "ok"; models: string[]; modelInstalled: boolean }
  | { kind: "error"; error: ProviderError; fix: FixGuide[] }
  | { kind: "denied"; origin: string };

interface OriginDenied {
  code: "ORIGIN_DENIED";
  origin: string;
}

export type ProviderSaveError =
  | OriginDenied
  | { code: "BASE_URL_INVALID" }
  | { code: "MODEL_REQUIRED" }
  | SettingsProblem;

export type SaveResult = Result<void, ProviderSaveError>;

export interface ProviderModelDeps {
  extensionId: string;
  fetch: OllamaConfig["fetch"];
  hostAccess: HostAccess;
  secrets: SecretsStore;
  update(change: (current: Settings) => Settings): Promise<Result<void, SettingsProblem>>;
}

const CHECK_TIMEOUT_MS = 10_000;

const OLLAMA_DEFAULTS = defaultSettings("en").provider;

const DEFAULT_BASE_URL: Record<ProviderKind, string> = {
  ollama: OLLAMA_DEFAULTS.baseUrl,
  "openai-compatible": "http://localhost:1234/v1",
};

const DEFAULT_MODEL: Record<ProviderKind, string> = {
  ollama: OLLAMA_DEFAULTS.model,
  "openai-compatible": "",
};

const IMPLICIT_TAG = ":latest";

export function providerDraft(provider: ProviderSettings, apiKey: Option<string>): ProviderDraft {
  return {
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: apiKey.unwrapOr(""),
  };
}

export function switchKind(draft: ProviderDraft, kind: ProviderKind): ProviderDraft {
  if (draft.kind === kind) return draft;

  return { kind, baseUrl: DEFAULT_BASE_URL[kind], model: DEFAULT_MODEL[kind], apiKey: "" };
}

export function editBaseUrl(
  draft: ProviderDraft,
  baseUrl: string,
  saved: ProviderSettings,
): ProviderDraft {
  const savedOrigin = webOriginOf(saved.baseUrl).toUndefined();
  const sameOrigin = webOriginOf(baseUrl)
    .filter((origin) => origin === savedOrigin)
    .isSome();

  return { ...draft, baseUrl, apiKey: sameOrigin ? draft.apiKey : "" };
}

const withTag = (model: string): string =>
  model.includes(":") ? model : `${model}${IMPLICIT_TAG}`;

export function sameModel(kind: ProviderKind, listed: string, wanted: string): boolean {
  if (kind !== "ollama") return listed === wanted;

  return withTag(listed) === withTag(wanted);
}

export function listedModel(kind: ProviderKind, models: string[], wanted: string): Option<string> {
  const model = wanted.trim();

  return Option.fromNullable(models.find((listed) => sameModel(kind, listed, model)));
}

export function providerModel(deps: ProviderModelDeps) {
  const grantedFor = async (baseUrl: string): Promise<Result<void, OriginDenied>> => {
    const pattern = remotePatternOf(baseUrl);

    if (pattern.isNone()) return Result.ok();

    const origin = pattern.unwrap();
    const granted = await deps.hostAccess.request([origin]);

    if (!granted) return Result.fail({ code: "ORIGIN_DENIED", origin });

    return Result.ok();
  };

  const testConnection = async (draft: ProviderDraft): Promise<ConnectionView> => {
    const access = await grantedFor(draft.baseUrl);

    if (access.isFailure) return { kind: "denied", origin: access.getError().origin };

    const origin = extensionOriginOf(deps.extensionId);
    const catalog = providerFor(
      {
        kind: draft.kind,
        baseUrl: draft.baseUrl.trim(),
        model: draft.model,
        timeoutMs: CHECK_TIMEOUT_MS,
      },
      { fetch: deps.fetch, apiKey: Option.some(draft.apiKey.trim()), origin, now: Date.now },
    );
    const checked = await new ProviderCheckService({ catalog }).check(draft.model);

    return checked.match<ConnectionView>({
      ok: ({ models }) => ({
        kind: "ok",
        models,
        modelInstalled: listedModel(draft.kind, models, draft.model).isSome(),
      }),
      fail: (error) => ({
        kind: "error",
        error,
        fix: error.code === "PROVIDER_FORBIDDEN_ORIGIN" ? ollamaOriginsFix(origin) : [],
      }),
    });
  };

  const save = async (draft: ProviderDraft): Promise<SaveResult> => {
    const model = draft.model.trim();
    const url = webUrlOf(draft.baseUrl);

    if (url.isNone()) return Result.fail({ code: "BASE_URL_INVALID" });

    if (model === "") return Result.fail({ code: "MODEL_REQUIRED" });

    const access = await grantedFor(draft.baseUrl);

    if (access.isFailure) return access;

    const updated = await deps.update((current) => ({
      ...current,
      provider: { ...current.provider, kind: draft.kind, baseUrl: draft.baseUrl.trim(), model },
    }));

    if (updated.isFailure) return Result.fail(updated.getError());

    const apiKey = draft.apiKey.trim();

    if (draft.kind === "openai-compatible" && apiKey !== "") {
      await deps.secrets.setApiKey(apiKey, url.unwrap().origin);

      return Result.ok();
    }

    await deps.secrets.clear();

    return Result.ok();
  };

  return { testConnection, save };
}
