import "../bubble/bubble.css";
import { PageTranslationService } from "@lambe/translation/application/page-translation.service";
import { BlockId } from "@lambe/translation/domain/block/value-objects/block-id.vo";
import { DomPageSurface } from "@lambe/translation/infrastructure/dom/dom-page-surface";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { ChromeLanguageDetector } from "../adapters/chrome/chrome-language-detector";
import { PortBatchTranslator } from "../adapters/chrome/port-batch-translator";
import { type Bubble, mountBubble } from "../bubble/bubble-view";
import type { ClickHandlers } from "../bubble/click-classifier";
import { loadRuntimeConfig } from "../config/runtime-config";
import { connectWorker } from "../messaging/connect-worker";
import { toggleMessageSchema } from "../messaging/toggle.contract";
import { SettingsStore } from "../settings/settings-store";
import { hostsBubble } from "./bubble-frames";

function blockIds(): () => BlockId {
  let next = 0;

  return () => {
    next += 1;

    return BlockId.create(`lambe-${next}`).getValue();
  };
}

interface ContentApp {
  page: PageTranslationService;
  translator: PortBatchTranslator;
}

async function buildApp(): Promise<ContentApp> {
  const config = await loadRuntimeConfig(
    new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage()),
  );
  const translator = new PortBatchTranslator(connectWorker);
  const service = new PageTranslationService({
    surface: new DomPageSurface({ doc: document, window, ids: blockIds() }),
    translator,
    capacity: translator,
    detector: new ChromeLanguageDetector((text) => chrome.i18n.detectLanguage(text)),
    target: config.target,
    maxConcurrency: config.provider.concurrency,
    maxSegmentsPerRequest: config.maxSegmentsPerRequest,
    firstRequestSegments: config.firstRequestSegments,
  });

  service.subscribe((state) => {
    if (state.kind === "error") console.warn(`Lambë: ${state.error.message}`);
  });

  return { page: service, translator };
}

interface MountedBubble {
  bubble: Bubble;
  unsubscribe(): void;
}

type AppAction = (app: ContentApp) => Promise<void>;

const ALL_FRAMES = import.meta.env.LAMBE_ALL_FRAMES === "1";

async function showBubble(
  ctx: ContentScriptContext,
  page: PageTranslationService,
  handlers: ClickHandlers,
): Promise<void> {
  const ui = await createShadowRootUi<MountedBubble>(ctx, {
    name: "lambe-bubble",
    mode: "open",
    position: "inline",
    anchor: () => document.documentElement,
    onMount: (_container, shadow) => {
      const bubble = mountBubble(shadow, handlers);
      const unsubscribe = page.subscribe((state) => bubble.render(state));

      bubble.render(page.state());

      return { bubble, unsubscribe };
    },
    onRemove: (mounted) => {
      mounted?.unsubscribe();
      mounted?.bubble.destroy();
    },
  });

  ui.mount();
}

export function startContent(ctx: ContentScriptContext): void {
  const app = buildApp();
  const run = (action: AppAction, failure: string): void => {
    void app.then(action).catch((cause: unknown) => console.error(failure, cause));
  };
  const translating =
    (action: (page: PageTranslationService) => Promise<void>): AppAction =>
    ({ page, translator }) => {
      translator.warmUp();

      return action(page);
    };
  const toggle = () =>
    run(
      translating((page) => page.toggle()),
      "Lambë could not toggle the page.",
    );
  const retranslate = () =>
    run(
      translating((page) => page.retranslate()),
      "Lambë could not translate the page again.",
    );

  chrome.runtime.onMessage.addListener((message) => {
    if (!toggleMessageSchema.safeParse(message).success) return false;

    toggle();

    return false;
  });

  if (!hostsBubble({ isTop: window.top === window.self, allFrames: ALL_FRAMES })) return;

  run(
    ({ page }) => showBubble(ctx, page, { onSingle: toggle, onDouble: retranslate }),
    "Lambë could not show its bubble.",
  );
}
