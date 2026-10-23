import { defineContentScript } from "wxt/utils/define-content-script";
import { startContent } from "../src/composition/content";

export default defineContentScript({
  registration: "runtime",
  runAt: "document_idle",
  cssInjectionMode: "manual",
  main(ctx) {
    startContent(ctx);
  },
});
