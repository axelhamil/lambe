import { CaptionTranslationService } from "@lambe/translation/application/caption-translation.service";
import { YoutubePlayerSurface } from "@lambe/translation/infrastructure/youtube/youtube-player-surface";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { PortBatchTranslator } from "../adapters/chrome/port-batch-translator";
import { loadRuntimeConfig } from "../config/runtime-config";
import { catalogUiText } from "../i18n/ui-text";
import { connectWorker } from "../messaging/connect-worker";
import { SettingsStore } from "../settings/settings-store";
import { mountCaptionOverlay } from "../youtube/caption-overlay";
import { mountPlayerButton, type PlayerButton } from "../youtube/player-button";

interface YoutubeApp {
  captions: CaptionTranslationService;
  translator: PortBatchTranslator;
  release(): void;
}

async function buildApp(button: PlayerButton): Promise<YoutubeApp> {
  const config = await loadRuntimeConfig(
    new SettingsStore(chrome.storage.local, chrome.i18n.getUILanguage()),
  );
  const translator = new PortBatchTranslator(connectWorker);
  const overlay = mountCaptionOverlay(document, catalogUiText);
  const captions = new CaptionTranslationService({
    surface: new YoutubePlayerSurface({ doc: document, window }),
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

  return {
    captions,
    translator,
    release() {
      unsubscribe();
      detach();
      captions.dispose();
      overlay.destroy();
    },
  };
}

export function startYoutube(ctx: ContentScriptContext): void {
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
