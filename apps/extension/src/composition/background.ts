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
import { activateTab, showUnavailable, type TabScripting } from "../activation/activate-tab";
import { StorageTranslationCache } from "../adapters/chrome/storage-translation-cache";
import { loadRuntimeConfig } from "../config/runtime-config";
import { t } from "../i18n/t";
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

interface Worker {
  service: BatchTranslationService;
  capacity: ProviderCapacity;
}

function settingsStore(): SettingsStore {
  return new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage());
}

async function buildWorker(): Promise<Worker> {
  const config = await loadRuntimeConfig(settingsStore());
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

const tabScripting: TabScripting = {
  sendMessage: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
  injectFiles: async (tabId, files) => {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  },
};

async function activate(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;

  const deps = {
    tabs: tabScripting,
    settings: settingsStore(),
    openOptions: () => chrome.runtime.openOptionsPage(),
  };

  try {
    const outcome = await activateTab(deps, tabId);

    if (outcome !== "unavailable") return;

    await showUnavailable(chrome.action, tabId, {
      unavailable: t("ext.unavailableTitle"),
      idle: t("ext.actionTitle"),
    });
  } catch (cause) {
    console.error("Lambë could not activate the tab.", cause);
  }
}

async function activateActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await activate(tab?.id);
  } catch (cause) {
    console.error("Lambë could not find the active tab.", cause);
  }
}

function syncScriptRegistrations(): void {
  const settings = settingsStore();
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

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== "install") return;

    void chrome.runtime.openOptionsPage().catch((cause: unknown) => {
      console.error("Lambë could not open its settings.", cause);
    });
  });

  chrome.action.onClicked.addListener((tab) => {
    void activate(tab.id);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== TOGGLE_COMMAND) return;

    void (tab?.id === undefined ? activateActiveTab() : activate(tab.id));
  });
}
