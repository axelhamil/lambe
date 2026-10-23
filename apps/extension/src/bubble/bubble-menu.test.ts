import { afterEach, describe, expect, mock, test } from "bun:test";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { menuActions } from "../composition/menu-actions";
import { fakeUiText } from "../i18n/testing/fake-ui-text";
import { defaultSettings, type Settings } from "../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../settings/settings-store";
import { fakeStorageArea } from "../settings/testing/fake-storage-area";
import { type MenuActions, mountBubbleMenu } from "./bubble-menu";
import { mountBubble } from "./bubble-view";

const SITE = "https://news.example";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const MENU_STATE = {
  origin: SITE,
  siteRule: { origin: SITE, autoTranslate: false, hideBubble: false },
  languages: [language("de"), language("en"), language("fr")],
};

function fakeActions(): MenuActions {
  return {
    translateTo: mock(() => {}),
    autoTranslateSite: mock(() => {}),
    hideOnSite: mock(() => {}),
    openSettings: mock(() => {}),
  };
}

function setup(actions: MenuActions = fakeActions()) {
  const host = document.createElement("div");

  document.body.append(host);

  const shadow = host.attachShadow({ mode: "open" });
  const menu = mountBubbleMenu(shadow, actions, fakeUiText.translate);
  const bubble = mountBubble(
    shadow,
    {
      onSingle: () => {},
      onDouble: () => {},
      onMenu: (anchor) => menu.open(anchor, MENU_STATE),
    },
    fakeUiText,
  );
  const button = shadow.querySelector<HTMLButtonElement>("button.bubble");

  if (button === null) throw new Error("The bubble did not mount.");

  return { shadow, menu, bubble, button, actions };
}

function menuOf(shadow: ShadowRoot): HTMLElement {
  const menu = shadow.querySelector<HTMLElement>("[role=menu]");

  if (menu === null) throw new Error("The menu did not mount.");

  return menu;
}

function items(shadow: ShadowRoot): HTMLButtonElement[] {
  return [...menuOf(shadow).querySelectorAll<HTMLButtonElement>("button")];
}

function item(shadow: ShadowRoot, label: string): HTMLButtonElement {
  const found = items(shadow).find((candidate) => candidate.textContent === label);

  if (found === undefined) throw new Error(`No menu item ${label}.`);

  return found;
}

function rightClick(target: HTMLElement): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true });

  target.dispatchEvent(event);

  return event;
}

function key(target: Element | null, name: string): void {
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

const isOpen = (shadow: ShadowRoot): boolean => !menuOf(shadow).hidden;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const consented = (change: Partial<Settings> = {}): Settings => ({
  ...defaultSettings("en"),
  consentAt: 1,
  target: "fr",
  ...change,
});

function wired() {
  const storage = fakeStorageArea({ [SETTINGS_KEY]: consented() });
  const translateWith = mock((_language: LanguageCode) => {});
  const sendToWorker = mock((_message: unknown) => {});
  const actions = menuActions({
    origin: SITE,
    settings: new SettingsStore(storage.area, "en"),
    translateWith,
    sendToWorker,
  });

  return { storage, translateWith, sendToWorker, ...setup(actions) };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("bubble menu", () => {
  test("right_click_opens_the_menu_without_the_page_context_menu", () => {
    const { shadow, button } = setup();
    const pageListener = mock(() => {});

    document.addEventListener("contextmenu", pageListener);

    const event = rightClick(button);

    document.removeEventListener("contextmenu", pageListener);

    expect(event.defaultPrevented).toBe(true);
    expect(pageListener).not.toHaveBeenCalled();
    expect(isOpen(shadow)).toBe(true);
    expect(shadow.activeElement).toBe(items(shadow)[0] ?? null);
  });

  test("escape_closes_and_returns_focus_to_the_bubble", () => {
    const { shadow, button } = setup();

    rightClick(button);
    key(shadow.activeElement, "Escape");

    expect(isOpen(shadow)).toBe(false);
    expect(shadow.activeElement).toBe(button);
  });

  test("arrow_keys_move_between_items", () => {
    const { shadow, button } = setup();

    rightClick(button);

    const all = items(shadow);

    key(shadow.activeElement, "ArrowDown");

    expect(shadow.activeElement).toBe(all[1] ?? null);

    key(shadow.activeElement, "ArrowUp");
    key(shadow.activeElement, "ArrowUp");

    expect(shadow.activeElement).toBe(all.at(-1) ?? null);
  });

  test("outside_click_closes", () => {
    const { shadow, button } = setup();

    rightClick(button);
    item(shadow, "<menu.settings>").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );

    expect(isOpen(shadow)).toBe(true);

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(isOpen(shadow)).toBe(false);
  });

  test("hide_on_site_saves_the_rule_and_closes", async () => {
    const { shadow, button, storage } = wired();

    rightClick(button);
    item(shadow, "<menu.hideOnSite>").click();
    await flush();

    const { settings } = await new SettingsStore(storage.area, "en").load();

    expect(settings.sites).toEqual([{ origin: SITE, autoTranslate: false, hideBubble: true }]);
    expect(isOpen(shadow)).toBe(false);
  });

  test("translate_to_uses_a_page_scoped_target", async () => {
    const { shadow, button, storage, translateWith } = wired();

    rightClick(button);
    item(shadow, new Intl.DisplayNames(undefined, { type: "language" }).of("de") ?? "de").click();
    await flush();

    const { settings } = await new SettingsStore(storage.area, "en").load();

    expect(translateWith.mock.calls.map(([chosen]) => chosen.value)).toEqual(["de"]);
    expect(settings.target).toBe("fr");
    expect(settings.recentTargets).toEqual(["de"]);
  });

  test("auto_translate_asks_the_worker_to_open_the_sites_section", () => {
    const { shadow, button, sendToWorker } = wired();

    rightClick(button);
    item(shadow, "<menu.autoTranslateSite>").click();

    expect(sendToWorker.mock.calls).toEqual([
      [{ type: "lambe/open-options", section: "sites", origin: SITE }],
    ]);
  });

  test("labels_come_from_the_catalog", () => {
    const { shadow, button } = setup();

    rightClick(button);

    const labels = items(shadow).map((candidate) => candidate.textContent);

    expect(menuOf(shadow).getAttribute("aria-label")).toBe("<menu.label>");
    expect(labels).toContain("<menu.moreLanguages>");
    expect(labels).toContain("<menu.autoTranslateSite>");
    expect(labels).toContain("<menu.hideOnSite>");
    expect(labels).toContain("<menu.settings>");
  });
});
