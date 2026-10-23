import "../src/youtube/player-button.css";
import { defineContentScript } from "wxt/utils/define-content-script";
import { startYoutube } from "../src/composition/youtube";

export default defineContentScript({
  registration: "runtime",
  runAt: "document_idle",
  cssInjectionMode: "manifest",
  main(ctx) {
    startYoutube(ctx);
  },
});
