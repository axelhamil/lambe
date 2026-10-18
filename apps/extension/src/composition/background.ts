import { BatchTranslationService } from "@lambe/translation/application/batch-translation.service";
import { instructionPrompt } from "@lambe/translation/domain/prompt/instruction-prompt";
import { modelFamilyOf } from "@lambe/translation/domain/prompt/prompt-adapter";
import { translateGemmaPrompt } from "@lambe/translation/domain/prompt/translategemma-prompt";
import { sha256Hasher } from "@lambe/translation/infrastructure/hashing/sha256-hasher";
import { ConcurrencyLimitedProvider } from "@lambe/translation/infrastructure/providers/concurrency-limited-provider";
import { OllamaProvider } from "@lambe/translation/infrastructure/providers/ollama-provider";
import { StorageTranslationCache } from "../adapters/chrome/storage-translation-cache";
import { loadRuntimeConfig } from "../config/runtime-config";
import { TOGGLE_MESSAGE } from "../messaging/toggle.contract";
import type { TranslateBatchResponse } from "../messaging/translate-batch.contract";
import { translateBatchEnvelopeSchema } from "../messaging/translate-batch.contract";
import { respondToTranslateBatch, unexpectedFailure } from "../messaging/translate-batch.handler";

const TOGGLE_COMMAND = "toggle-translation";

const MISSING_RECEIVER = "Receiving end does not exist";

async function buildBatchService(): Promise<BatchTranslationService> {
  const config = await loadRuntimeConfig(chrome.storage.local, chrome.i18n.getUILanguage());
  const { provider } = config;
  const ollama = new OllamaProvider({
    baseUrl: provider.baseUrl,
    model: provider.model,
    fetch: globalThis.fetch.bind(globalThis),
    timeoutMs: provider.timeoutMs,
    forbiddenHint: `chrome-extension://${chrome.runtime.id}`,
  });

  return new BatchTranslationService({
    provider: new ConcurrencyLimitedProvider(ollama, provider.concurrency),
    cache: new StorageTranslationCache(chrome.storage.local),
    hasher: sha256Hasher,
    prompt:
      modelFamilyOf(provider.model) === "translategemma" ? translateGemmaPrompt : instructionPrompt,
    contextTokens: config.contextTokens,
    maxSegmentsPerBatch: config.maxSegmentsPerBatch,
  });
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

export function startBackground(): void {
  let service: Promise<BatchTranslationService> | undefined;

  const batchService = (): Promise<BatchTranslationService> => {
    service ??= buildBatchService();

    return service;
  };

  const answer = async (payload: unknown): Promise<TranslateBatchResponse> => {
    try {
      return await respondToTranslateBatch(payload, await batchService());
    } catch (cause) {
      service = undefined;

      return unexpectedFailure(cause);
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const envelope = translateBatchEnvelopeSchema.safeParse(message);

    if (!envelope.success) return false;

    void answer(envelope.data.payload)
      .then(sendResponse)
      .catch((cause: unknown) => console.warn("Lambë could not answer the tab.", cause));

    return true;
  });

  chrome.action.onClicked.addListener((tab) => {
    void toggleTab(tab.id);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== TOGGLE_COMMAND) return;

    void (tab?.id === undefined ? toggleActiveTab() : toggleTab(tab.id));
  });
}
