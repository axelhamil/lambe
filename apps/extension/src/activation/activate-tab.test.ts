import { describe, expect, mock, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { TOGGLE_MESSAGE } from "../messaging/toggle.contract";
import { PAGE_SCRIPT } from "../permissions";
import { defaultSettings } from "../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../settings/settings-store";
import { fakeStorageArea } from "../settings/testing/fake-storage-area";
import { activateTab, type TabScripting } from "./activate-tab";

const TAB = 7;

const MISSING_RECEIVER = "Could not establish connection. Receiving end does not exist.";

interface FakeTab {
  pageScript: boolean;
  restricted: boolean;
}

function fakeTabs(tab: FakeTab) {
  const toggles: unknown[] = [];
  const injections: string[][] = [];

  const tabs: TabScripting = {
    sendMessage: async (_tabId, message) => {
      if (!tab.pageScript) throw new Error(MISSING_RECEIVER);

      toggles.push(message);

      return undefined;
    },
    injectFiles: async (_tabId, files) => {
      if (tab.restricted) throw new Error("Cannot access a chrome:// URL");

      injections.push(files);
      tab.pageScript = true;
    },
  };

  return { tabs, toggles, injections };
}

function activation(tab: FakeTab, consentAt: Option<number> = Option.some(1)) {
  const storage = fakeStorageArea({
    [SETTINGS_KEY]: { ...defaultSettings("en"), consentAt: consentAt.toUndefined() },
  });
  const fake = fakeTabs(tab);
  const openOptions = mock(async () => {});
  const deps = { tabs: fake.tabs, settings: new SettingsStore(storage.area, "en"), openOptions };

  return { ...fake, openOptions, activate: () => activateTab(deps, TAB) };
}

describe("activateTab", () => {
  test("click_before_consent_opens_the_options_page", async () => {
    const given = activation({ pageScript: true, restricted: false }, Option.none());

    const outcome = await given.activate();

    expect(outcome).toBe("needs-consent");
    expect(given.openOptions).toHaveBeenCalledTimes(1);
    expect(given.toggles).toEqual([]);
    expect(given.injections).toEqual([]);
  });

  test("present_page_script_is_toggled_not_reinjected", async () => {
    const given = activation({ pageScript: true, restricted: false });

    const outcome = await given.activate();

    expect(outcome).toBe("toggled");
    expect(given.toggles).toEqual([TOGGLE_MESSAGE]);
    expect(given.injections).toEqual([]);
  });

  test("missing_page_script_is_injected_then_toggled", async () => {
    const given = activation({ pageScript: false, restricted: false });

    const outcome = await given.activate();

    expect(outcome).toBe("injected");
    expect(given.injections).toEqual([[PAGE_SCRIPT]]);
    expect(given.toggles).toEqual([TOGGLE_MESSAGE]);
  });

  test("restricted_page_reports_instead_of_throwing", async () => {
    const given = activation({ pageScript: false, restricted: true });

    const outcome = await given.activate();

    expect(outcome).toBe("unavailable");
    expect(given.toggles).toEqual([]);
    expect(given.openOptions).not.toHaveBeenCalled();
  });

  test("second_click_after_injection_does_not_inject_again", async () => {
    const given = activation({ pageScript: false, restricted: false });

    await given.activate();
    const second = await given.activate();

    expect(second).toBe("toggled");
    expect(given.injections).toEqual([[PAGE_SCRIPT]]);
    expect(given.toggles).toEqual([TOGGLE_MESSAGE, TOGGLE_MESSAGE]);
  });
});
