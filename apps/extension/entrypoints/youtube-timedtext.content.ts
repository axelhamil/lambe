import { createTimedtextRelay } from "@lambe/translation/infrastructure/youtube/timedtext-channel";
import { installTimedtextHook } from "@lambe/translation/infrastructure/youtube/timedtext-hook";
import { defineContentScript } from "wxt/utils/define-content-script";
import { YOUTUBE_MATCHES } from "../src/permissions";

export default defineContentScript({
  matches: YOUTUBE_MATCHES,
  runAt: "document_start",
  world: "MAIN",
  main() {
    installTimedtextHook(window, createTimedtextRelay(document).publish);
  },
});
