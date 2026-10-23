import { resolve } from "node:path";
import { parseMessagesFile } from "@wxt-dev/i18n/build";

const messages = await parseMessagesFile(resolve(import.meta.dir, "../locales/en.yml"));

const catalog = new Map(
  messages.flatMap((message) =>
    message.type === "plural" ? [] : [[message.key.join("_"), message.message] as const],
  ),
);

if (!("chrome" in globalThis)) {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      i18n: {
        getMessage: (name: string) => catalog.get(name) ?? "",
        getUILanguage: () => "en",
      },
    },
  });
}
