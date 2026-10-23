import { CaptionTranslationService } from "@lambe/translation/application/caption-translation.service";
import { YoutubePlayerSurface } from "@lambe/translation/infrastructure/youtube/youtube-player-surface";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { PortBatchTranslator } from "../adapters/chrome/port-batch-translator";
import { loadRuntimeConfig } from "../config/runtime-config";
import { catalogUiText } from "../i18n/ui-text";
import { createLogger, debugSetting } from "../logging/logger";
import { connectWorker } from "../messaging/connect-worker";
import { SettingsStore } from "../settings/settings-store";
import { mountCaptionOverlay } from "../youtube/caption-overlay";
import { mountPlayerButton, type PlayerButton } from "../youtube/player-button";
import { invalidateWhenOrphaned } from "./orphan-watch";
import { followPageRules } from "./page-rules";

interface YoutubeApp {
  captions: CaptionTranslationService;
  translator: PortBatchTranslator;
  release(): void;
}

async function buildApp(button: PlayerButton): Promise<YoutubeApp> {
  const store = new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage());
  const config = await loadRuntimeConfig(store);
  const translator = new PortBatchTranslator(connectWorker);
  const overlay = mountCaptionOverlay(document, catalogUiText);
  const captions = new CaptionTranslationService({
    surface: new YoutubePlayerSurface({
      doc: document,
      window,
      log: createLogger(debugSetting(store)),
    }),
    display: overlay,
    translator,
    capacity: translator,
    target: config.target,
    maxConcurrency: config.provider.concurrency,
    sentencesPerRequest: config.captionSentencesPerRequest,
    aheadMs: config.captionAheadMs,
  });
  const detach = captions.attach();
  const unsubscribe = captions.subscribe((state) => button.render(state));

  button.render(captions.state());

  const unfollow = await followPageRules(store, location.origin, (rules) =>
    captions.retarget(rules.target),
  );

  return {
    captions,
    translator,
    release() {
      unfollow();
      unsubscribe();
      detach();
      captions.dispose();
      overlay.destroy();
    },
  };
}

export function startYoutube(ctx: ContentScriptContext): void {
  invalidateWhenOrphaned(ctx);

  const button = mountPlayerButton(document, () => toggle(), catalogUiText);
  const app = buildApp(button);
  const toggle = (): void => {
    void app
      .then(({ captions, translator }) => {
        translator.warmUp();

        return captions.toggle();
      })
      .catch((cause: unknown) => console.error("Lambë could not toggle the captions.", cause));
  };

  app.catch((cause: unknown) => console.error("Lambë could not start on YouTube.", cause));
  ctx.onInvalidated(() => {
    button.destroy();
    void app.then(
      (started) => started.release(),
      () => undefined,
    );
  });
}
