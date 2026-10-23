import { afterEach, describe, expect, mock, test } from "bun:test";
import { providerError } from "@lambe/translation/domain/provider/provider-error";
import { fakeUiText } from "../i18n/testing/fake-ui-text";
import { mountBubble } from "./bubble-view";

function setup() {
  const host = document.createElement("div");

  document.body.append(host);

  const root = host.attachShadow({ mode: "open" });
  const handlers = {
    onSingle: mock(() => {}),
    onDouble: mock(() => {}),
    onMenu: mock(() => {}),
  };
  const bubble = mountBubble(root, handlers, fakeUiText);
  const button = root.querySelector("button");

  if (button === null) throw new Error("The bubble did not mount a button.");

  return { root, handlers, bubble, button };
}

function pointer(target: HTMLElement, type: string, clientX: number, clientY: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId: 1 }));
}

function drag(target: HTMLElement, from: number, to: number): void {
  pointer(target, "pointerdown", 500, from);
  pointer(target, "pointermove", 500, to);
  pointer(target, "pointerup", 500, to);
}

function topOf(button: HTMLElement): string {
  return button.style.getPropertyValue("--lambe-top");
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
      error: providerError("PROVIDER_TIMEOUT", "The model took too long."),
    });

    expect(button.classList.contains("on")).toBe(false);
    expect(button.classList.contains("error")).toBe(true);
    expect(button.hasAttribute("title")).toBe(true);

    bubble.render({ kind: "original" });

    expect(button.classList.contains("error")).toBe(false);
    expect(button.hasAttribute("title")).toBe(false);
  });

  test("dragging_moves_the_tab_along_the_right_edge_and_keeps_it_on_screen", async () => {
    const { button, handlers } = setup();

    expect(topOf(button)).toBe("150px");

    drag(button, 200, 320);

    expect(topOf(button)).toBe("270px");
    expect(button.style.getPropertyValue("--lambe-left")).toBe("");

    drag(button, 300, -400);

    expect(topOf(button)).toBe("8px");

    drag(button, 100, 5000);
    await wait(300);

    expect(topOf(button)).toBe(`${window.innerHeight - 8}px`);
    expect(handlers.onSingle).not.toHaveBeenCalled();
    expect(handlers.onDouble).not.toHaveBeenCalled();
  });

  test("the_tab_returns_to_its_dragged_place_once_the_window_grows_back", () => {
    const { button } = setup();
    const height = window.innerHeight;
    const resizeTo = (value: number): void => {
      Object.defineProperty(window, "innerHeight", { configurable: true, value });
      window.dispatchEvent(new Event("resize"));
    };

    drag(button, 200, 650);

    expect(topOf(button)).toBe("600px");

    resizeTo(300);

    expect(topOf(button)).toBe("292px");

    resizeTo(height);

    expect(topOf(button)).toBe("600px");
  });

  test("a_move_under_4px_is_a_click_and_4px_is_a_drag", async () => {
    const { button, handlers } = setup();
    const rest = topOf(button);

    drag(button, 200, 203);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);
    expect(topOf(button)).toBe(rest);

    pointer(button, "pointerdown", 500, 200);
    pointer(button, "pointermove", 500, 204);

    expect(topOf(button)).not.toBe(rest);

    pointer(button, "pointerup", 500, 204);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);
  });

  test("pointercancel_ends_the_drag_and_puts_the_tab_back", async () => {
    const { button, handlers } = setup();
    const rest = topOf(button);

    pointer(button, "pointerdown", 500, 200);
    pointer(button, "pointermove", 500, 400);
    pointer(button, "pointercancel", 500, 400);

    expect(button.classList.contains("dragging")).toBe(false);
    expect(topOf(button)).toBe(rest);

    pointer(button, "pointermove", 500, 450);
    pointer(button, "pointerup", 500, 450);
    await wait(300);

    expect(topOf(button)).toBe(rest);
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

    drag(button, 200, 202);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);

    drag(button, 200, 200);
    drag(button, 200, 200);
    await wait(300);

    expect(handlers.onSingle).toHaveBeenCalledTimes(2);
    expect(handlers.onDouble).toHaveBeenCalledTimes(1);
  });

  test("destroy_removes_listeners_and_nodes", async () => {
    const { root, bubble, button, handlers } = setup();

    drag(button, 200, 200);
    bubble.destroy();
    drag(button, 200, 200);
    drag(button, 200, 200);
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
