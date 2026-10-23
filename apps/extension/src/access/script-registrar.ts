import type { Registration } from "./registrations";

export interface ScriptRegistrar {
  registered(): Promise<Registration[]>;
  register(registrations: Registration[]): Promise<void>;
  update(registrations: Registration[]): Promise<void>;
  unregister(ids: string[]): Promise<void>;
}

type RegisteredScript = chrome.scripting.RegisteredContentScript;

const rooted = (path: string): string => (path.startsWith("/") ? path : `/${path}`);

function registrationOf(script: RegisteredScript): Registration {
  return {
    id: script.id,
    js: (script.js ?? []).map(rooted),
    css: (script.css ?? []).map(rooted),
    matches: script.matches ?? [],
    world: script.world ?? "ISOLATED",
    runAt: script.runAt ?? "document_idle",
    allFrames: script.allFrames ?? false,
    persistAcrossSessions: script.persistAcrossSessions ?? true,
  };
}

function scriptOf({ css, ...registration }: Registration): RegisteredScript {
  return css.length > 0 ? { ...registration, css } : registration;
}

export const chromeScriptRegistrar: ScriptRegistrar = {
  registered: async () =>
    (await chrome.scripting.getRegisteredContentScripts()).map(registrationOf),
  register: (registrations) => chrome.scripting.registerContentScripts(registrations.map(scriptOf)),
  update: (registrations) => chrome.scripting.updateContentScripts(registrations),
  unregister: (ids) => chrome.scripting.unregisterContentScripts({ ids }),
};
