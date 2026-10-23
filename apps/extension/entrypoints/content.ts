import { defineContentScript } from "wxt/utils/define-content-script";
import { startContent } from "../src/composition/content";
import { PAGE_MATCHES } from "../src/permissions";

export default defineContentScript({
  matches: PAGE_MATCHES,
  runAt: "document_idle",
  cssInjectionMode: "ui",
  main(ctx) {
    startContent(ctx);
  },
});
