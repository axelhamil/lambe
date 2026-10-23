import { Option } from "@lambe/kernel/option";
import { PageTranslationService } from "@lambe/translation/application/page-translation.service";
import { isShowingTranslation } from "@lambe/translation/application/view-state";
import { BlockId } from "@lambe/translation/domain/block/value-objects/block-id.vo";
import type { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { DomPageSurface } from "@lambe/translation/infrastructure/dom/dom-page-surface";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { runWithConsent } from "../activation/consent-gate";
import { ChromeLanguageDetector } from "../adapters/chrome/chrome-language-detector";
import { PortBatchTranslator } from "../adapters/chrome/port-batch-translator";
import bubbleCss from "../bubble/bubble.css?raw";
import {
  type BubbleMenu,
  type MenuActions,
  type MenuState,
  mountBubbleMenu,
} from "../bubble/bubble-menu";
import bubbleMenuCss from "../bubble/bubble-menu.css?raw";
import { type Bubble, mountBubble } from "../bubble/bubble-view";
import type { ClickHandlers } from "../bubble/click-classifier";
import { loadRuntimeConfig } from "../config/runtime-config";
import { catalogUiText } from "../i18n/ui-text";
import { connectWorker } from "../messaging/connect-worker";
import type { OpenOptionsMessage } from "../messaging/open-options.contract";
import { toggleMessageSchema } from "../messaging/toggle.contract";
import { SettingsStore } from "../settings/settings-store";
import { menuActions } from "./menu-actions";
import { bubbleVisible, followPageRules, type PageRules, pageNeedsTranslation } from "./page-rules";

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
  menu: BubbleMenu;
  unsubscribe(): void;
}

interface MenuSource {
  actions: MenuActions;
  state(): MenuState;
}

type AppAction = (app: ContentApp) => Promise<void>;

interface BubbleSlot {
  show(visible: boolean): void;
}

async function bubbleSlot(
  ctx: ContentScriptContext,
  page: PageTranslationService,
  handlers: ClickHandlers,
  source: MenuSource,
): Promise<BubbleSlot> {
  const ui = await createShadowRootUi<MountedBubble>(ctx, {
    name: "lambe-bubble",
    css: `${bubbleCss}\n${bubbleMenuCss}`,
    mode: "open",
    position: "inline",
    anchor: () => document.documentElement,
    onMount: (_container, shadow) => {
      const menu = mountBubbleMenu(shadow, source.actions, catalogUiText.translate);
      const bubble = mountBubble(
        shadow,
        { ...handlers, onMenu: (anchor) => menu.open(anchor, source.state()) },
        catalogUiText,
      );
      const unsubscribe = page.subscribe((state) => bubble.render(state));

      bubble.render(page.state());

      return { bubble, menu, unsubscribe };
    },
    onRemove: (mounted) => {
      mounted?.unsubscribe();
      mounted?.menu.destroy();
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
  let refresh = (): void => undefined;
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
  let pageTarget = Option.none<LanguageCode>();
  const translateWith = (language: LanguageCode): void => {
    touched = true;
    pageTarget = Option.some(language);
    run(
      translating(async (page) => {
        page.retarget(language);

        if (isShowingTranslation(page.state())) return;

        await page.toggle();
      }),
      "Lambë could not translate the page to this language.",
    );
  };
  const sendToWorker = (message: OpenOptionsMessage): void => {
    void chrome.runtime.sendMessage(message).catch((cause: unknown) => {
      console.error("Lambë could not open its settings.", cause);
    });
  };
  const withConsent = (action: () => void): void => {
    void runWithConsent(store, action, () => sendToWorker({ type: "lambe/open-options" })).catch(
      (cause: unknown) => console.error("Lambë could not read its settings.", cause),
    );
  };
  const follow: AppAction = async ({ page }) => {
    let latest: Option<PageRules> = Option.none();
    const actions = menuActions({
      origin: location.origin,
      settings: store,
      translateWith: (language) => withConsent(() => translateWith(language)),
      sendToWorker,
    });
    const menuState = (): MenuState => {
      const rules = latest.unwrap();

      return { origin: location.origin, siteRule: rules.siteRule, languages: rules.languages };
    };
    const bubble = await bubbleSlot(
      ctx,
      page,
      { onSingle: () => withConsent(toggle), onDouble: () => withConsent(retranslate) },
      { actions, state: menuState },
    );
    const apply = (rules: PageRules): void => {
      latest = Option.some(rules);
      page.retarget(pageTarget.unwrapOr(rules.target));
      bubble.show(bubbleVisible(rules, touched));

      if (touched || !pageNeedsTranslation(rules, document.documentElement.lang)) return;

      toggle();
    };

    refresh = () => latest.map(apply);
    ctx.onInvalidated(await followPageRules(store, location.origin, apply));
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (!toggleMessageSchema.safeParse(message).success) return false;

    toggle();
    refresh();

    return false;
  });

  run(follow, "Lambë could not follow its settings.");
}
