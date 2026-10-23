import type { Result } from "@lambe/kernel/result";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { SecretsStore } from "../settings/secrets-store";
import type { Settings } from "../settings/settings";
import type { LoadedSettings, SettingsProblem, SettingsStore } from "../settings/settings-store";

type Saved = Result<void, SettingsProblem>;

interface SettingsContextValue {
  loaded: LoadedSettings;
  save(next: Settings): Promise<Saved>;
  update(change: (current: Settings) => Settings): Promise<Saved>;
  reset(): Promise<Saved>;
  secrets: SecretsStore;
  uiLanguage: string;
}

interface SettingsProviderProps {
  store: SettingsStore;
  secrets: SecretsStore;
  initial: LoadedSettings;
  defaults: Settings;
  uiLanguage: string;
  children: ReactNode;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({
  store,
  secrets,
  initial,
  defaults,
  uiLanguage,
  children,
}: SettingsProviderProps) {
  const [loaded, setLoaded] = useState(initial);

  useEffect(() => store.subscribe(setLoaded), [store]);

  const value = useMemo<SettingsContextValue>(() => {
    const save = async (next: Settings): Promise<Saved> => {
      const saved = await store.save(next);

      if (saved.isSuccess) setLoaded(await store.load());

      return saved;
    };

    const update = async (change: (current: Settings) => Settings): Promise<Saved> => {
      const updated = await store.update(change);

      if (updated.isSuccess) setLoaded(await store.load());

      return updated;
    };

    return { loaded, save, update, reset: () => save(defaults), secrets, uiLanguage };
  }, [loaded, store, secrets, defaults, uiLanguage]);

  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);

  if (context === undefined) throw new Error("useSettings needs a SettingsProvider above it.");

  return context;
}
