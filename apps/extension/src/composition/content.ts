import { PageTranslationService } from "@lambe/translation/application/page-translation.service";
import { BlockId } from "@lambe/translation/domain/block/value-objects/block-id.vo";
import { DomPageSurface } from "@lambe/translation/infrastructure/dom/dom-page-surface";
import { ChromeLanguageDetector } from "../adapters/chrome/chrome-language-detector";
import { PortBatchTranslator } from "../adapters/chrome/port-batch-translator";
import { loadRuntimeConfig } from "../config/runtime-config";
import type { RuntimePort } from "../messaging/runtime-port";
import { toggleMessageSchema } from "../messaging/toggle.contract";
import { TRANSLATE_PORT_NAME } from "../messaging/translate-batch.contract";

function blockIds(): () => BlockId {
  let next = 0;

  return () => {
    next += 1;

    return BlockId.create(`lambe-${next}`).getValue();
  };
}

function connectWorker(): RuntimePort {
  const port = chrome.runtime.connect({ name: TRANSLATE_PORT_NAME });

  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
  });

  return port;
}

async function buildPageService(): Promise<PageTranslationService> {
  const config = await loadRuntimeConfig(chrome.storage.local, chrome.i18n.getUILanguage());
  const service = new PageTranslationService({
    surface: new DomPageSurface({ doc: document, window, ids: blockIds() }),
    translator: new PortBatchTranslator(connectWorker),
    detector: new ChromeLanguageDetector((text) => chrome.i18n.detectLanguage(text)),
    target: config.target,
    maxSegmentsPerRequest: config.maxSegmentsPerRequest,
    firstRequestSegments: config.firstRequestSegments,
  });

  service.subscribe((state) => {
    if (state.kind === "error") console.warn(`Lambë: ${state.error.message}`);
  });

  return service;
}

export function startContent(): void {
  const service = buildPageService();

  chrome.runtime.onMessage.addListener((message) => {
    if (!toggleMessageSchema.safeParse(message).success) return false;

    void service
      .then((page) => page.toggle())
      .catch((cause: unknown) => console.error("Lambë could not toggle the page.", cause));

    return false;
  });
}
