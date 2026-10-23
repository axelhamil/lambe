import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { t } from "../../src/i18n/t";
import { App } from "../../src/options/app";
import { SettingsProvider } from "../../src/options/use-settings";
import { SecretsStore } from "../../src/settings/secrets-store";
import { defaultSettings } from "../../src/settings/settings";
import { SettingsStore } from "../../src/settings/settings-store";
import "./options.css";

async function start(container: HTMLElement): Promise<void> {
  const uiLanguage = chrome.i18n.getUILanguage();
  const store = new SettingsStore(chrome.storage.local, uiLanguage);
  const initial = await store.load();

  document.documentElement.lang = uiLanguage;
  document.title = t("options.shell.documentTitle");

  createRoot(container).render(
    <StrictMode>
      <SettingsProvider
        store={store}
        secrets={new SecretsStore(chrome.storage.local)}
        initial={initial}
        defaults={defaultSettings(uiLanguage)}
      >
        <App />
      </SettingsProvider>
    </StrictMode>,
  );
}

const container = document.getElementById("root");

if (container) void start(container);
