import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { BatchTranslationService } from "@lambe/translation/application/batch-translation.service";
import type { DebugLog } from "@lambe/translation/application/ports/debug-log";
import type { ProviderCapacity } from "@lambe/translation/application/ports/provider-capacity";
import type { TranslationCache } from "@lambe/translation/application/ports/translation-cache";
import { DEFAULT_GUIDELINES } from "@lambe/translation/domain/prompt/guidelines";
import { instructionPrompt } from "@lambe/translation/domain/prompt/instruction-prompt";
import { modelFamilyOf } from "@lambe/translation/domain/prompt/prompt-adapter";
import { translateGemmaPrompt } from "@lambe/translation/domain/prompt/translategemma-prompt";
import {
  type ProviderError,
  providerError,
} from "@lambe/translation/domain/provider/provider-error";
import { sha256Hasher } from "@lambe/translation/infrastructure/hashing/sha256-hasher";
import { AdaptiveConcurrencyProvider } from "@lambe/translation/infrastructure/providers/adaptive-concurrency-provider";
import {
  KEEP_ALIVE_MS,
  type OllamaConfig,
  OllamaProvider,
} from "@lambe/translation/infrastructure/providers/ollama-provider";
import { OpenAiCompatibleProvider } from "@lambe/translation/infrastructure/providers/openai-compatible-provider";
import { isConsented } from "../activation/consent-gate";
import { type RuntimeConfig, toRuntimeConfig } from "../config/runtime-config";
import type { SecretsStore } from "../settings/secrets-store";
import type { Settings } from "../settings/settings";
import type { SettingsStore } from "../settings/settings-store";

export interface Worker {
  service: BatchTranslationService;
  capacity: ProviderCapacity;
}

export type BuildWorker = (config: RuntimeConfig, apiKey: Option<string>) => Worker;

export interface WorkerEnv {
  fetch: OllamaConfig["fetch"];
  cache: TranslationCache;
  forbiddenHint: string;
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

function providerFor(
  config: RuntimeConfig,
  apiKey: Option<string>,
  env: WorkerEnv,
): OllamaProvider | OpenAiCompatibleProvider {
  const { provider } = config;
  const common = {
    baseUrl: provider.baseUrl,
    model: provider.model,
    fetch: env.fetch,
    timeoutMs: provider.timeoutMs,
  };

  if (provider.kind === "openai-compatible") {
    return new OpenAiCompatibleProvider({ ...common, apiKey, now: env.now });
  }

  return new OllamaProvider({ ...common, forbiddenHint: env.forbiddenHint });
}

export function workerBuilder(env: WorkerEnv): BuildWorker {
  return (config, apiKey) => {
    const adaptive = new AdaptiveConcurrencyProvider(providerFor(config, apiKey, env), {
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
      prompt:
        modelFamilyOf(config.provider.model) === "translategemma"
          ? translateGemmaPrompt
          : instructionPrompt,
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
    const [{ settings }, apiKey] = await Promise.all([
      this.deps.settings.load(),
      this.deps.secrets.apiKey(),
    ]);

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
