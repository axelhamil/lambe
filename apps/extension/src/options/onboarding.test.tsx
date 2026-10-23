import { afterEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { t } from "../i18n/t";
import { OPTIONAL_HOSTS } from "../permissions";
import { App } from "./app";
import { buttonNamed, renderWithSettings } from "./testing/render";

const welcomeShown = (container: HTMLElement): boolean =>
  container.textContent?.includes(t("onboarding.title")) ?? false;

const openSection = async (hash: string): Promise<void> => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
};

let cleanup = async (): Promise<void> => {};

afterEach(async () => {
  await cleanup();
  window.location.hash = "";
});

describe("onboarding", () => {
  test("translation_stays_blocked_until_the_consent_button_is_clicked", async () => {
    const rendered = await renderWithSettings(<App />);
    cleanup = rendered.unmount;

    await openSection("#privacy");

    expect(rendered.container.querySelector("h1")?.textContent).toBe(
      t("options.shell.section.privacy"),
    );
    expect(welcomeShown(rendered.container)).toBe(true);
    expect((await rendered.store.load()).settings.consentAt).toBeUndefined();
    expect(rendered.storage.writes).toEqual([]);
  });

  test("consent_click_stores_consent_at_and_hides_the_welcome", async () => {
    const request = mock(async (_request: { origins: string[] }) => false);
    Object.defineProperty(chrome, "permissions", { configurable: true, value: { request } });
    const before = Date.now();
    const rendered = await renderWithSettings(<App />);
    cleanup = async () => {
      Reflect.deleteProperty(chrome, "permissions");
      await rendered.unmount();
    };

    await act(async () => {
      buttonNamed(rendered.container, t("onboarding.consent"))?.click();
    });

    const consentAt = (await rendered.store.load()).settings.consentAt ?? 0;

    expect(request).toHaveBeenCalledWith({ origins: OPTIONAL_HOSTS });
    expect(consentAt).toBeGreaterThanOrEqual(before);
    expect(welcomeShown(rendered.container)).toBe(false);
  });
});
