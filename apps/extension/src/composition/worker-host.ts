import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { BatchTranslationService } from "@lambe/translation/application/batch-translation.service";
import type { DebugLog } from "@lambe/translation/application/ports/debug-log";
import type { ProviderCapacity } from "@lambe/translation/application/ports/provider-capacity";
import type { TranslationCache } from "@lambe/translation/application/ports/translation-cache";
import { DEFAULT_GUIDELINES } from "@lambe/translation/domain/prompt/guidelines";
import { modelProfileOf } from "@lambe/translation/domain/prompt/model-profile";
import {
  type ProviderError,
  providerError,
} from "@lambe/translation/domain/provider/provider-error";
import { sha256Hasher } from "@lambe/translation/infrastructure/hashing/sha256-hasher";
import { AdaptiveConcurrencyProvider } from "@lambe/translation/infrastructure/providers/adaptive-concurrency-provider";
import {
  KEEP_ALIVE_MS,
  type OllamaConfig,
} from "@lambe/translation/infrastructure/providers/ollama-provider";
import { isConsented } from "../activation/consent-gate";
import { type RuntimeConfig, toRuntimeConfig } from "../config/runtime-config";
import { keyFor, type SecretsStore } from "../settings/secrets-store";
import type { Settings } from "../settings/settings";
import type { SettingsStore } from "../settings/settings-store";
import { providerFor } from "./provider-factory";

export interface Worker {
  service: BatchTranslationService;
  capacity: ProviderCapacity;
}

export type BuildWorker = (config: RuntimeConfig, apiKey: Option<string>) => Worker;

export interface WorkerEnv {
  fetch: OllamaConfig["fetch"];
  cache: TranslationCache;
  origin: string;
  now: () => number;
  log: DebugLog;
}

interface WorkerHostDeps {
  settings: SettingsStore;
  secrets: SecretsStore;
  build: BuildWorker;
}

interface BuiltWorker {
  fingerprint: string;
  worker: Worker;
}

function consentRequired(): ProviderError {
  return providerError(
    "CONSENT_REQUIRED",
    "Translation is refused until the user accepts the data disclosure in the settings.",
  );
}

export function workerBuilder(env: WorkerEnv): BuildWorker {
  return (config, apiKey) => {
    const provider = providerFor(config.provider, { ...env, apiKey });
    const adaptive = new AdaptiveConcurrencyProvider(provider, {
      maxConcurrency: config.provider.concurrency,
      forgetAfterIdleMs: KEEP_ALIVE_MS,
      now: env.now,
      onStats: (stats) => {
        env.log.debug("Lambë: provider stats", stats);
      },
    });
    const service = new BatchTranslationService({
      provider: adaptive,
      cache: env.cache,
      hasher: sha256Hasher,
      prompt: modelProfileOf(config.provider.model).prompt,
      contextTokens: config.contextTokens,
      maxSegmentsPerBatch: config.maxSegmentsPerBatch,
      guidelines: config.guidelines.unwrapOr(DEFAULT_GUIDELINES),
    });

    return { service, capacity: adaptive };
  };
}

function fingerprintOf(settings: Settings, apiKey: Option<string>): string {
  return JSON.stringify([
    settings.provider,
    settings.prompt,
    settings.debug,
    apiKey.toUndefined() ?? null,
  ]);
}

export class WorkerHost implements ProviderCapacity {
  private built: Option<BuiltWorker> = Option.none();

  public constructor(private readonly deps: WorkerHostDeps) {}

  public async service(): Promise<Result<BatchTranslationService, ProviderError>> {
    const [{ settings }, credential] = await Promise.all([
      this.deps.settings.load(),
      this.deps.secrets.credential(),
    ]);
    const apiKey = keyFor(credential, settings.provider.baseUrl);

    if (!isConsented(settings)) return Result.fail(consentRequired());

    const fingerprint = fingerprintOf(settings, apiKey);
    const current = this.built.filter((built) => built.fingerprint === fingerprint);

    if (current.isSome()) return Result.ok(current.unwrap().worker.service);

    const worker = this.deps.build(toRuntimeConfig(settings), apiKey);

    this.built = Option.some({ fingerprint, worker });

    return Result.ok(worker.service);
  }

  public concurrency(): Option<number> {
    return this.built.flatMap((built) => built.worker.capacity.concurrency());
  }
}
