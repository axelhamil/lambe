import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { t } from "../i18n/t";
import { App } from "./app";
import { hashOf, SECTION_NAME, SECTIONS } from "./section-model";
import { renderWithSettings } from "./testing/render";

let cleanup = async (): Promise<void> => {};

afterEach(async () => {
  await cleanup();
  window.location.hash = "";
});

describe("settings shell", () => {
  test("every_section_is_reachable_from_the_navigation", async () => {
    const rendered = await renderWithSettings(<App />);
    cleanup = rendered.unmount;

    const links = SECTIONS.map((section) =>
      rendered.container.querySelector(`nav a[href="${hashOf(section)}"]`),
    );

    expect(links.every((link) => link !== null)).toBe(true);
  });

  test("the_hash_opens_its_section_and_marks_it_current", async () => {
    const rendered = await renderWithSettings(<App />);
    cleanup = rendered.unmount;

    await act(async () => {
      window.location.hash = hashOf("privacy");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    const current = rendered.container.querySelector('nav a[aria-current="page"]');

    expect(rendered.container.querySelector("h1")?.textContent).toBe(t(SECTION_NAME.privacy));
    expect(current?.getAttribute("href")).toBe(hashOf("privacy"));
  });
});
