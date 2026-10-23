import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { providerError } from "@lambe/translation/domain/provider/provider-error";
import { YOUTUBE_SELECTORS } from "@lambe/translation/infrastructure/youtube/youtube-selectors";
import { fakeUiText } from "../i18n/testing/fake-ui-text";
import { mountPlayerButton } from "./player-button";

const FIXTURE = readFileSync(
  new URL("../../../../packages/translation/fixtures/youtube/watch-player.html", import.meta.url),
  "utf8",
);

const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function element(selector: string): Element {
  const found = document.querySelector(selector);

  if (found === null) throw new Error(`fixture lacks ${selector}`);

  return found;
}

function lambeButton(): Element {
  return element(".lambe-ytp-button");
}

beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(FIXTURE, "text/html").body.innerHTML;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("player button", () => {
  test("button_sits_right_before_cc", () => {
    const onClick = mock(() => {});
    const button = mountPlayerButton(document, onClick, fakeUiText);
    const lambe = lambeButton();

    expect(element(YOUTUBE_SELECTORS.subtitlesButton).previousElementSibling).toBe(lambe);
    expect(lambe.classList.contains("ytp-button")).toBe(true);
    expect(lambe.getAttribute("aria-label")).toBe("<youtube.button>");
    expect(lambe.getAttribute("aria-pressed")).toBe("false");

    lambe.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(1);

    button.destroy();

    expect(document.querySelector(".lambe-ytp-button")).toBeNull();
  });

  test("button_comes_back_after_controls_rebuild", async () => {
    const button = mountPlayerButton(document, () => {}, fakeUiText);
    const controls = element(YOUTUBE_SELECTORS.rightControls);
    const rebuilt = controls.cloneNode(true);

    if (!(rebuilt instanceof Element)) throw new Error("clone is not an element");

    for (const stale of rebuilt.querySelectorAll(".lambe-ytp-button")) stale.remove();

    controls.replaceWith(rebuilt);
    await flushMutations();

    expect(document.querySelectorAll(".lambe-ytp-button")).toHaveLength(1);
    expect(element(YOUTUBE_SELECTORS.subtitlesButton).previousElementSibling).toBe(lambeButton());

    button.destroy();
  });

  test("button_reflects_each_view_state", () => {
    const button = mountPlayerButton(document, () => {}, fakeUiText);
    const lambe = lambeButton();

    button.render({ kind: "translating" });

    expect(lambe.getAttribute("aria-pressed")).toBe("true");
    expect(lambe.classList.contains("lambe-ytp-button-pulse")).toBe(true);

    button.render({ kind: "translated" });

    expect(lambe.getAttribute("aria-pressed")).toBe("true");
    expect(lambe.classList.contains("lambe-ytp-button-pulse")).toBe(false);

    button.render({
      kind: "error",
      error: providerError("PROVIDER_UNREACHABLE", "Ollama is not running."),
    });

    expect(lambe.getAttribute("data-state")).toBe("error");
    expect(lambe.hasAttribute("aria-description")).toBe(true);
    expect(lambe.getAttribute("aria-pressed")).toBe("false");

    button.render({ kind: "original" });

    expect(lambe.getAttribute("aria-pressed")).toBe("false");
    expect(lambe.hasAttribute("data-state")).toBe(false);
    expect(lambe.hasAttribute("aria-description")).toBe(false);

    button.destroy();
  });

  test("hover_shows_a_player_tooltip_that_follows_the_state", () => {
    const button = mountPlayerButton(document, () => {}, fakeUiText);
    const lambe = lambeButton();

    lambe.dispatchEvent(new MouseEvent("mouseenter"));

    expect(element(`${YOUTUBE_SELECTORS.player} > .lambe-ytp-tooltip`).textContent).toBe(
      "<youtube.button>",
    );
    expect(lambe.hasAttribute("title")).toBe(false);

    button.render({ kind: "translating" });

    expect(lambe.getAttribute("aria-label")).toBe("<youtube.buttonOn>");
    expect(element(".lambe-ytp-tooltip").textContent).toBe("<youtube.translating>");

    button.render({
      kind: "error",
      error: providerError("PROVIDER_UNREACHABLE", "Ollama is not running.", {
        baseUrl: "http://localhost:11434",
      }),
    });

    expect(lambe.getAttribute("aria-label")).toBe("<youtube.button>");
    expect(element(".lambe-ytp-tooltip").textContent).toBe(
      "No model server at http://localhost:11434.",
    );

    lambe.dispatchEvent(new MouseEvent("mouseleave"));

    expect(element(".lambe-ytp-tooltip").hasAttribute("hidden")).toBe(true);

    button.destroy();

    expect(document.querySelector(".lambe-ytp-tooltip")).toBeNull();
  });
});
