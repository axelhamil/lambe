import { defineBackground } from "wxt/utils/define-background";
import { startBackground } from "../src/composition/background";

export default defineBackground(() => {
  startBackground();
});
