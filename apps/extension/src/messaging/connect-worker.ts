import type { RuntimePort } from "./runtime-port";
import { TRANSLATE_PORT_NAME } from "./translate-batch.contract";

export function connectWorker(): RuntimePort {
  const port = chrome.runtime.connect({ name: TRANSLATE_PORT_NAME });

  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
  });

  return port;
}
