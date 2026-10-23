import type { BatchTranslateOptions } from "@lambe/translation/application/batch-translation.service";
import { chromeHostAccess } from "../access/host-access";
import { reconciler } from "../access/reconcile";
import { chromeScriptRegistrar } from "../access/script-registrar";
import { activateTab, showUnavailable, type TabScripting } from "../activation/activate-tab";
import { StorageTranslationCache } from "../adapters/chrome/storage-translation-cache";
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
import { SecretsStore } from "../settings/secrets-store";
import { SettingsStore } from "../settings/settings-store";
import { WorkerHost, workerBuilder } from "./worker-host";

const TOGGLE_COMMAND = "toggle-translation";

function settingsStore(): SettingsStore {
  return new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage());
}

function workerHost(): WorkerHost {
  return new WorkerHost({
    settings: settingsStore(),
    secrets: new SecretsStore(chrome.storage.local),
    build: workerBuilder({
      fetch: globalThis.fetch.bind(globalThis),
      cache: new StorageTranslationCache(chrome.storage.local),
      forbiddenHint: `chrome-extension://${chrome.runtime.id}`,
      now: Date.now,
    }),
  });
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

  const host = workerHost();

  const answer = async (
    payload: unknown,
    options: BatchTranslateOptions,
  ): Promise<TranslateBatchResponse> => {
    try {
      const service = await host.service();

      if (service.isFailure) return { ok: false, error: service.getError() };

      return await respondToTranslateBatch(payload, service.getValue(), options);
    } catch (cause) {
      return unexpectedFailure(cause);
    }
  };

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT_NAME) return;

    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
    });
    serveTranslatePort(port, answer, host);
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
