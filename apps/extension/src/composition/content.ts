import { PageTranslationService } from "@lambe/translation/application/page-translation.service";
import { BlockId } from "@lambe/translation/domain/block/value-objects/block-id.vo";
import { DomPageSurface } from "@lambe/translation/infrastructure/dom/dom-page-surface";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { ChromeLanguageDetector } from "../adapters/chrome/chrome-language-detector";
import { PortBatchTranslator } from "../adapters/chrome/port-batch-translator";
import bubbleCss from "../bubble/bubble.css?raw";
import { type Bubble, mountBubble } from "../bubble/bubble-view";
import type { ClickHandlers } from "../bubble/click-classifier";
import { loadRuntimeConfig } from "../config/runtime-config";
import { catalogUiText } from "../i18n/ui-text";
import { connectWorker } from "../messaging/connect-worker";
import { toggleMessageSchema } from "../messaging/toggle.contract";
import { SettingsStore } from "../settings/settings-store";
import { followPageRules, type PageRules, pageNeedsTranslation } from "./page-rules";

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

async function buildApp(store: SettingsStore): Promise<ContentApp> {
  const config = await loadRuntimeConfig(store);
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

interface BubbleSlot {
  show(visible: boolean): void;
}

async function bubbleSlot(
  ctx: ContentScriptContext,
  page: PageTranslationService,
  handlers: ClickHandlers,
): Promise<BubbleSlot> {
  const ui = await createShadowRootUi<MountedBubble>(ctx, {
    name: "lambe-bubble",
    css: bubbleCss,
    mode: "open",
    position: "inline",
    anchor: () => document.documentElement,
    onMount: (_container, shadow) => {
      const bubble = mountBubble(shadow, handlers, catalogUiText);
      const unsubscribe = page.subscribe((state) => bubble.render(state));

      bubble.render(page.state());

      return { bubble, unsubscribe };
    },
    onRemove: (mounted) => {
      mounted?.unsubscribe();
      mounted?.bubble.destroy();
    },
  });
  let visible = false;

  return {
    show(next) {
      if (next === visible) return;

      visible = next;

      if (next) ui.mount();
      else ui.remove();
    },
  };
}

export function startContent(ctx: ContentScriptContext): void {
  const store = new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage());
  const app = buildApp(store);
  let touched = false;
  const run = (action: AppAction, failure: string): void => {
    void app.then(action).catch((cause: unknown) => console.error(failure, cause));
  };
  const translating =
    (action: (page: PageTranslationService) => Promise<void>): AppAction =>
    ({ page, translator }) => {
      translator.warmUp();

      return action(page);
    };
  const toggle = (): void => {
    touched = true;
    run(
      translating((page) => page.toggle()),
      "Lambë could not toggle the page.",
    );
  };
  const retranslate = (): void => {
    touched = true;
    run(
      translating((page) => page.retranslate()),
      "Lambë could not translate the page again.",
    );
  };
  const follow: AppAction = async ({ page }) => {
    const bubble = await bubbleSlot(ctx, page, { onSingle: toggle, onDouble: retranslate });
    const apply = (rules: PageRules): void => {
      page.retarget(rules.target);
      bubble.show(!rules.hideBubble);

      if (touched || !pageNeedsTranslation(rules, document.documentElement.lang)) return;

      toggle();
    };

    ctx.onInvalidated(await followPageRules(store, location.origin, apply));
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (!toggleMessageSchema.safeParse(message).success) return false;

    toggle();

    return false;
  });

  run(follow, "Lambë could not follow its settings.");
}
