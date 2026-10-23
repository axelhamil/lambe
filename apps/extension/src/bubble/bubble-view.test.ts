import { afterEach, describe, expect, mock, test } from "bun:test";
import { providerError } from "@lambe/translation/domain/provider/provider-error";
import { fakeUiText } from "../i18n/testing/fake-ui-text";
import { mountBubble } from "./bubble-view";

function setup() {
  const host = document.createElement("div");

  document.body.append(host);

  const root = host.attachShadow({ mode: "open" });
  const handlers = { onSingle: mock(() => {}), onDouble: mock(() => {}) };
  const bubble = mountBubble(root, handlers, fakeUiText);
  const button = root.querySelector("button");

  if (button === null) throw new Error("The bubble did not mount a button.");

  return { root, handlers, bubble, button };
}

function pointer(target: HTMLElement, type: string, clientX: number, clientY: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId: 1 }));
}

function drag(target: HTMLElement, from: number, to: number): void {
  pointer(target, "pointerdown", from, 200);
  pointer(target, "pointermove", to, 200);
  pointer(target, "pointerup", to, 200);
}

function leftOf(button: HTMLElement): string {
  return button.style.getPropertyValue("--lambe-left");
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  document.body.replaceChildren();
});

describe("bubble view", () => {
  test("render_applies_state_classes_to_the_host_button", () => {
    const { bubble, button } = setup();

    bubble.render({ kind: "translating" });

    expect(button.classList.contains("busy")).toBe(true);

    bubble.render({ kind: "translated" });

    expect(button.classList.contains("busy")).toBe(false);
    expect(button.classList.contains("on")).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    bubble.render({
      kind: "error",
      error: providerError("PROVIDER_UNREACHABLE", "Ollama is not running."),
    });

    expect(button.classList.contains("on")).toBe(false);
    expect(button.classList.contains("error")).toBe(true);
    expect(button.hasAttribute("title")).toBe(true);

    bubble.render({ kind: "original" });

    expect(button.classList.contains("error")).toBe(false);
    expect(button.hasAttribute("title")).toBe(false);
  });

  test("tail_class_flips_with_side", async () => {
    const { button, handlers } = setup();
    const right = window.innerWidth - 20;

    drag(button, right, 30);

    expect(button.classList.contains("left")).toBe(true);

    drag(button, 30, right);
    await wait(300);

    expect(button.classList.contains("left")).toBe(false);
    expect(handlers.onSingle).not.toHaveBeenCalled();
    expect(handlers.onDouble).not.toHaveBeenCalled();
  });

  test("a_move_under_4px_is_a_click_and_4px_is_a_drag", async () => {
    const { button, handlers } = setup();
    const rest = leftOf(button);

    drag(button, 500, 503);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);
    expect(leftOf(button)).toBe(rest);

    pointer(button, "pointerdown", 500, 200);
    pointer(button, "pointermove", 504, 200);

    expect(leftOf(button)).not.toBe(rest);

    pointer(button, "pointerup", 504, 200);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);
  });

  test("pointercancel_ends_the_drag_and_returns_to_the_edge", async () => {
    const { button, handlers } = setup();
    const rest = leftOf(button);

    pointer(button, "pointerdown", 500, 200);
    pointer(button, "pointermove", 100, 200);
    pointer(button, "pointercancel", 100, 200);

    expect(button.classList.contains("dragging")).toBe(false);
    expect(leftOf(button)).toBe(rest);

    pointer(button, "pointermove", 50, 200);
    pointer(button, "pointerup", 50, 200);
    await wait(300);

    expect(leftOf(button)).toBe(rest);
    expect(handlers.onSingle).not.toHaveBeenCalled();
  });

  test("keyboard_activation_toggles_exactly_once", async () => {
    const { button, handlers } = setup();

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);
    expect(handlers.onDouble).not.toHaveBeenCalled();
  });

  test("mouse_press_keeps_page_focus_while_the_button_stays_keyboard_focusable", () => {
    const { root, button } = setup();
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });

    button.dispatchEvent(press);

    expect(press.defaultPrevented).toBe(true);

    button.focus();

    expect(root.activeElement).toBe(button);
  });

  test("click_without_moving_reaches_the_single_handler_and_two_reach_the_double", async () => {
    const { button, handlers } = setup();

    drag(button, 500, 502);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);

    drag(button, 500, 500);
    drag(button, 500, 500);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(2);
    expect(handlers.onDouble).toHaveBeenCalledTimes(1);
  });

  test("destroy_removes_listeners_and_nodes", async () => {
    const { root, bubble, button, handlers } = setup();

    drag(button, 500, 500);
    bubble.destroy();
    drag(button, 500, 500);
    drag(button, 500, 500);
    await wait(300);

    expect(root.childNodes.length).toBe(0);
    expect(handlers.onSingle).toHaveBeenCalledTimes(1);
    expect(handlers.onDouble).not.toHaveBeenCalled();
  });

  test("bubble_is_a_real_button_element_with_an_accessible_name", () => {
    const { button } = setup();

    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("<bubble.translate>");
  });

  test("labels_come_from_the_injected_catalog", () => {
    const { bubble, button } = setup();

    expect(button.getAttribute("aria-description")).toBe("<bubble.dragHint>");

    bubble.render({ kind: "translating" });

    expect(button.getAttribute("aria-label")).toBe("<bubble.translating>");

    bubble.render({ kind: "translated" });

    expect(button.getAttribute("aria-label")).toBe("<bubble.original>");

    bubble.render({ kind: "original" });

    expect(button.getAttribute("aria-label")).toBe("<bubble.translate>");
  });

  test("error_state_renders_the_code_through_render_error", () => {
    const { bubble, button } = setup();

    bubble.render({
      kind: "error",
      error: providerError("PROVIDER_UNREACHABLE", "Ollama is not running.", {
        baseUrl: "http://localhost:11434",
      }),
    });

    expect(button.getAttribute("aria-label")).toBe("<bubble.retry>");
    expect(button.title).toBe("<bubble.errorTitle>\nNo model server at http://localhost:11434.");
    expect(button.title).not.toContain("Ollama is not running.");
  });
});
