import { TOGGLE_MESSAGE } from "../messaging/toggle.contract";
import { PAGE_SCRIPT } from "../permissions";
import type { SettingsStore } from "../settings/settings-store";
import { hasConsent } from "./consent-gate";

export interface TabScripting {
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
  injectFiles(tabId: number, files: string[]): Promise<void>;
}

export type ActivationOutcome = "toggled" | "injected" | "needs-consent" | "unavailable";

interface ActivationDeps {
  tabs: TabScripting;
  settings: SettingsStore;
  openOptions(): Promise<void>;
}

export interface ActionBadge {
  setBadgeText(details: { tabId: number; text: string }): Promise<void>;
  setTitle(details: { tabId: number; title: string }): Promise<void>;
}

interface UnavailableTitles {
  unavailable: string;
  idle: string;
}

const MISSING_RECEIVER = "Receiving end does not exist";

const UNAVAILABLE_MS = 3000;

function isMissingReceiver(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes(MISSING_RECEIVER);
}

async function toggled(tabs: TabScripting, tabId: number): Promise<boolean> {
  try {
    await tabs.sendMessage(tabId, TOGGLE_MESSAGE);

    return true;
  } catch (cause) {
    if (isMissingReceiver(cause)) return false;

    throw cause;
  }
}

async function injectThenToggle(tabs: TabScripting, tabId: number): Promise<ActivationOutcome> {
  try {
    await tabs.injectFiles(tabId, [PAGE_SCRIPT]);
    await tabs.sendMessage(tabId, TOGGLE_MESSAGE);

    return "injected";
  } catch {
    return "unavailable";
  }
}

export async function activateTab(deps: ActivationDeps, tabId: number): Promise<ActivationOutcome> {
  if (!(await hasConsent(deps.settings))) {
    await deps.openOptions();

    return "needs-consent";
  }

  try {
    if (await toggled(deps.tabs, tabId)) return "toggled";
  } catch {
    return "unavailable";
  }

  return injectThenToggle(deps.tabs, tabId);
}

export async function showUnavailable(
  action: ActionBadge,
  tabId: number,
  titles: UnavailableTitles,
): Promise<void> {
  await action.setBadgeText({ tabId, text: "!" });
  await action.setTitle({ tabId, title: titles.unavailable });

  setTimeout(() => {
    void action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
    void action.setTitle({ tabId, title: titles.idle }).catch(() => undefined);
  }, UNAVAILABLE_MS);
}
