import "../src/youtube/player-button.css";
import { defineContentScript } from "wxt/utils/define-content-script";
import { startYoutube } from "../src/composition/youtube";
import { YOUTUBE_MATCHES } from "../src/permissions";

export default defineContentScript({
  matches: YOUTUBE_MATCHES,
  runAt: "document_idle",
  cssInjectionMode: "manifest",
  main(ctx) {
    startYoutube(ctx);
  },
});
