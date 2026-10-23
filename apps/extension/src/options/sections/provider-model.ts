import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { ModelCatalog } from "@lambe/translation/application/ports/model-catalog";
import { ProviderCheckService } from "@lambe/translation/application/provider-check.service";
import { type OriginsFix, ollamaOriginsFix } from "@lambe/translation/domain/provider/origins-fix";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import {
  type OllamaConfig,
  OllamaProvider,
} from "@lambe/translation/infrastructure/providers/ollama-provider";
import { OpenAiCompatibleProvider } from "@lambe/translation/infrastructure/providers/openai-compatible-provider";
import type { HostAccess } from "../../access/host-access";
import type { SecretsStore } from "../../settings/secrets-store";
import { defaultSettings, type ProviderSettings, type Settings } from "../../settings/settings";
import type { SettingsProblem } from "../../settings/settings-store";

export type ProviderKind = ProviderSettings["kind"];

export interface ProviderDraft {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type FixNote = "linuxEdit" | "macosRestart" | "windowsRestart";

export type FixStep =
  | { kind: "command"; text: string }
  | { kind: "note"; note: FixNote; line: Option<string> };

export interface FixGuide {
  os: OriginsFix["os"];
  steps: FixStep[];
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

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const WEB_SCHEMES = new Set(["http:", "https:"]);

const FIX_NOTE: Record<OriginsFix["os"], FixNote> = {
  linux: "linuxEdit",
  macos: "macosRestart",
  windows: "windowsRestart",
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

function webUrlOf(baseUrl: string): Option<URL> {
  return Option.fromNullable(URL.parse(baseUrl.trim())).filter((url) =>
    WEB_SCHEMES.has(url.protocol),
  );
}

function remoteOriginOf(url: URL): Option<string> {
  if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return Option.none();

  return Option.some(`${url.protocol}//${url.hostname}/*`);
}

function fixGuide({ os, origin, steps }: OriginsFix): FixGuide {
  return {
    os,
    steps: steps.map((step): FixStep => {
      if (step.kind === "command") return { kind: "command", text: step.text };

      const line =
        os === "linux"
          ? Option.some(`Environment="OLLAMA_ORIGINS=${origin}"`)
          : Option.none<string>();

      return { kind: "note", note: FIX_NOTE[os], line };
    }),
  };
}

export function providerModel(deps: ProviderModelDeps) {
  const catalogOf = (draft: ProviderDraft, baseUrl: string): ModelCatalog => {
    if (draft.kind === "ollama") {
      return new OllamaProvider({
        baseUrl,
        model: draft.model,
        fetch: deps.fetch,
        timeoutMs: CHECK_TIMEOUT_MS,
        forbiddenHint: `chrome-extension://${deps.extensionId}`,
      });
    }

    return new OpenAiCompatibleProvider({
      baseUrl,
      model: draft.model,
      apiKey: Option.some(draft.apiKey.trim()),
      fetch: deps.fetch,
      timeoutMs: CHECK_TIMEOUT_MS,
      now: Date.now,
    });
  };

  const grantedFor = async (url: URL): Promise<Result<void, OriginDenied>> => {
    const origin = remoteOriginOf(url);

    if (origin.isNone()) return Result.ok();

    const pattern = origin.unwrap();
    const granted = await deps.hostAccess.request([pattern]);

    if (!granted) return Result.fail({ code: "ORIGIN_DENIED", origin: pattern });

    return Result.ok();
  };

  const testConnection = async (draft: ProviderDraft): Promise<ConnectionView> => {
    const url = webUrlOf(draft.baseUrl);
    const access = url.isSome() ? await grantedFor(url.unwrap()) : Result.ok<OriginDenied>();

    if (access.isFailure) return { kind: "denied", origin: access.getError().origin };

    const baseUrl = draft.baseUrl.trim();
    const checked = await new ProviderCheckService({ catalog: catalogOf(draft, baseUrl) }).check(
      draft.model,
    );

    return checked.match<ConnectionView>({
      ok: ({ models }) => ({
        kind: "ok",
        models,
        modelInstalled: listedModel(draft.kind, models, draft.model).isSome(),
      }),
      fail: (error) => ({
        kind: "error",
        error,
        fix:
          error.code === "PROVIDER_FORBIDDEN_ORIGIN"
            ? ollamaOriginsFix(deps.extensionId).map(fixGuide)
            : [],
      }),
    });
  };

  const save = async (draft: ProviderDraft): Promise<SaveResult> => {
    const url = webUrlOf(draft.baseUrl);
    const model = draft.model.trim();

    if (url.isNone()) return Result.fail({ code: "BASE_URL_INVALID" });

    if (model === "") return Result.fail({ code: "MODEL_REQUIRED" });

    const access = await grantedFor(url.unwrap());

    if (access.isFailure) return access;

    const updated = await deps.update((current) => ({
      ...current,
      provider: { ...current.provider, kind: draft.kind, baseUrl: draft.baseUrl.trim(), model },
    }));

    if (updated.isFailure) return Result.fail(updated.getError());

    const apiKey = draft.apiKey.trim();

    if (draft.kind === "openai-compatible" && apiKey !== "") {
      await deps.secrets.setApiKey(apiKey);

      return Result.ok();
    }

    await deps.secrets.clear();

    return Result.ok();
  };

  return { testConnection, save };
}
