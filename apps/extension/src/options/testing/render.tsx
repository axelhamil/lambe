import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { SecretsStore } from "../../settings/secrets-store";
import { defaultSettings } from "../../settings/settings";
import { SettingsStore } from "../../settings/settings-store";
import { fakeStorageArea } from "../../settings/testing/fake-storage-area";
import { SettingsProvider } from "../use-settings";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export async function renderWithSettings(ui: ReactNode, initial: Record<string, unknown> = {}) {
  const storage = fakeStorageArea(initial);
  const store = new SettingsStore(storage.area, "en");
  const loaded = await store.load();
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.replaceChildren(container);

  await act(async () => {
    root.render(
      <SettingsProvider
        store={store}
        secrets={new SecretsStore(storage.area)}
        initial={loaded}
        defaults={defaultSettings("en")}
      >
        {ui}
      </SettingsProvider>,
    );
  });

  const unmount = async (): Promise<void> => {
    await act(async () => root.unmount());
  };

  return { storage, store, container, unmount };
}

export function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === name);
}
