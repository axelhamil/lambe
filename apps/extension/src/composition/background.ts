import { Option } from "@lambe/kernel/option";
import {
  type BatchTranslateOptions,
  BatchTranslationService,
} from "@lambe/translation/application/batch-translation.service";
import type { ProviderCapacity } from "@lambe/translation/application/ports/provider-capacity";
import { instructionPrompt } from "@lambe/translation/domain/prompt/instruction-prompt";
import { modelFamilyOf } from "@lambe/translation/domain/prompt/prompt-adapter";
import { translateGemmaPrompt } from "@lambe/translation/domain/prompt/translategemma-prompt";
import { sha256Hasher } from "@lambe/translation/infrastructure/hashing/sha256-hasher";
import { AdaptiveConcurrencyProvider } from "@lambe/translation/infrastructure/providers/adaptive-concurrency-provider";
import {
  KEEP_ALIVE_MS,
  OllamaProvider,
} from "@lambe/translation/infrastructure/providers/ollama-provider";
import { chromeHostAccess } from "../access/host-access";
import { reconciler } from "../access/reconcile";
import { chromeScriptRegistrar } from "../access/script-registrar";
import { StorageTranslationCache } from "../adapters/chrome/storage-translation-cache";
import { loadRuntimeConfig } from "../config/runtime-config";
import { TOGGLE_MESSAGE } from "../messaging/toggle.contract";
import {
  TRANSLATE_PORT_NAME,
  type TranslateBatchResponse,
} from "../messaging/translate-batch.contract";
import {
  respondToTranslateBatch,
  serveTranslatePort,
  unexpectedFailure,
} from "../messaging/translate-batch.handler";
import { SettingsStore } from "../settings/settings-store";

const TOGGLE_COMMAND = "toggle-translation";

const MISSING_RECEIVER = "Receiving end does not exist";

interface Worker {
  service: BatchTranslationService;
  capacity: ProviderCapacity;
}

async function buildWorker(): Promise<Worker> {
  const config = await loadRuntimeConfig(
    new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage()),
  );
  const { provider } = config;
  const ollama = new OllamaProvider({
    baseUrl: provider.baseUrl,
    model: provider.model,
    fetch: globalThis.fetch.bind(globalThis),
    timeoutMs: provider.timeoutMs,
    forbiddenHint: `chrome-extension://${chrome.runtime.id}`,
  });

  const adaptive = new AdaptiveConcurrencyProvider(ollama, {
    maxConcurrency: provider.concurrency,
    forgetAfterIdleMs: KEEP_ALIVE_MS,
    now: Date.now,
    onStats: (stats) => console.debug("Lambë: ollama stats", stats),
  });
  const service = new BatchTranslationService({
    provider: adaptive,
    cache: new StorageTranslationCache(chrome.storage.local),
    hasher: sha256Hasher,
    prompt:
      modelFamilyOf(provider.model) === "translategemma" ? translateGemmaPrompt : instructionPrompt,
    contextTokens: config.contextTokens,
    maxSegmentsPerBatch: config.maxSegmentsPerBatch,
    guidelines: "",
  });

  return { service, capacity: adaptive };
}

function isMissingReceiver(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes(MISSING_RECEIVER);
}

async function toggleTab(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;

  try {
    await chrome.tabs.sendMessage(tabId, TOGGLE_MESSAGE);
  } catch (cause) {
    if (isMissingReceiver(cause)) return;

    console.error("Lambë could not toggle the tab.", cause);
  }
}

async function toggleActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await toggleTab(tab?.id);
  } catch (cause) {
    console.error("Lambë could not find the active tab.", cause);
  }
}

function syncScriptRegistrations(): void {
  const settings = new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage());
  const sync = reconciler({ settings, access: chromeHostAccess, registrar: chromeScriptRegistrar });
  const resync = (): void => {
    void sync();
  };

  chrome.runtime.onInstalled.addListener(resync);
  chrome.runtime.onStartup.addListener(resync);
  chrome.permissions.onAdded.addListener(resync);
  chrome.permissions.onRemoved.addListener(resync);
  settings.subscribe(resync);
}

export function startBackground(): void {
  syncScriptRegistrations();

  let worker: Promise<Worker> | undefined;
  let capacity: ProviderCapacity | undefined;

  const reported: ProviderCapacity = {
    concurrency: () => capacity?.concurrency() ?? Option.none(),
  };

  const batchService = async (): Promise<BatchTranslationService> => {
    worker ??= buildWorker();

    const built = await worker;

    capacity = built.capacity;

    return built.service;
  };

  const answer = async (
    payload: unknown,
    options: BatchTranslateOptions,
  ): Promise<TranslateBatchResponse> => {
    try {
      return await respondToTranslateBatch(payload, await batchService(), options);
    } catch (cause) {
      worker = undefined;

      return unexpectedFailure(cause);
    }
  };

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT_NAME) return;

    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
    });
    serveTranslatePort(port, answer, reported);
  });

  chrome.action.onClicked.addListener((tab) => {
    void toggleTab(tab.id);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== TOGGLE_COMMAND) return;

    void (tab?.id === undefined ? toggleActiveTab() : toggleTab(tab.id));
  });
}
