import { mock } from "bun:test";
import type { RuntimePort } from "../runtime-port";

export function fakeRuntimePort() {
  const messageListeners: Array<(message: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  const port = {
    postMessage: mock((_message: unknown) => {}),
    onMessage: {
      addListener: (listener: (message: unknown) => void) => {
        messageListeners.push(listener);
      },
    },
    onDisconnect: {
      addListener: (listener: () => void) => {
        disconnectListeners.push(listener);
      },
    },
  } satisfies RuntimePort;

  const deliver = (message: unknown): void => {
    for (const listener of messageListeners) listener(message);
  };

  const disconnect = (): void => {
    for (const listener of disconnectListeners) listener();
  };

  const posted = (): unknown[] => port.postMessage.mock.calls.map(([message]) => message);

  return { port, deliver, disconnect, posted };
}
