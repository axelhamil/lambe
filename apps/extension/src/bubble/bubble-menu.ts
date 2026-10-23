import { languageName } from "@lambe/translation/domain/language/language-name";
import type { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import type { MessageKey } from "../i18n/t";
import type { SiteRule } from "../settings/site-rule";
import { BUBBLE_SELECTOR, viewport } from "./bubble-view";
import { menuPosition } from "./placement";

export interface MenuActions {
  translateTo(language: LanguageCode): void;
  autoTranslateSite(): void;
  hideOnSite(): void;
  chooseLanguage(): void;
  openSettings(): void;
}

export interface MenuState {
  origin: string;
  siteRule: SiteRule;
  languages: LanguageCode[];
}

export interface BubbleMenu {
  open(anchor: DOMRect, state: MenuState): void;
  close(): void;
  destroy(): void;
}

type Translate = (key: MessageKey) => string;

type ItemRole = "menuitem" | "menuitemcheckbox";

const HEADING_ID = "lambe-menu-languages";

const STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

function separator(): HTMLElement {
  const line = document.createElement("div");

  line.className = "menu-separator";
  line.setAttribute("role", "separator");

  return line;
}

export function mountBubbleMenu(
  shadow: ShadowRoot,
  actions: MenuActions,
  translate: Translate,
): BubbleMenu {
  const menu = document.createElement("div");
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  menu.className = "menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", translate("menu.label"));

  const items = (): HTMLButtonElement[] => [...menu.querySelectorAll<HTMLButtonElement>("button")];

  const close = (returnFocus: boolean): void => {
    if (menu.hidden) return;

    menu.hidden = true;
    menu.replaceChildren();

    if (returnFocus) shadow.querySelector<HTMLElement>(BUBBLE_SELECTOR)?.focus();
  };

  const item = (label: string, run: () => void, role: ItemRole = "menuitem"): HTMLButtonElement => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "menu-item";
    button.tabIndex = -1;
    button.textContent = label;
    button.setAttribute("role", role);
    button.addEventListener(
      "click",
      () => {
        close(true);
        run();
      },
      options,
    );

    return button;
  };

  const languageGroup = (languages: LanguageCode[]): HTMLElement[] => {
    const heading = document.createElement("div");
    const group = document.createElement("div");

    heading.id = HEADING_ID;
    heading.className = "menu-heading";
    heading.textContent = translate("menu.translateTo");
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", HEADING_ID);
    group.append(
      ...languages.map((language) =>
        item(languageName(language.value, []), () => actions.translateTo(language)),
      ),
      item(translate("menu.moreLanguages"), () => actions.chooseLanguage()),
    );

    return [heading, group];
  };

  const render = (state: MenuState): void => {
    const autoTranslate = item(
      translate("menu.autoTranslateSite"),
      () => actions.autoTranslateSite(),
      "menuitemcheckbox",
    );

    autoTranslate.setAttribute("aria-checked", String(state.siteRule.autoTranslate));
    menu.replaceChildren(
      ...languageGroup(state.languages),
      separator(),
      autoTranslate,
      item(translate("menu.hideOnSite"), () => actions.hideOnSite()),
      separator(),
      item(translate("menu.settings"), () => actions.openSettings()),
    );
  };

  const place = (anchor: DOMRect): void => {
    const box = menu.getBoundingClientRect();
    const position = menuPosition(anchor, box, viewport());

    menu.style.setProperty("--lambe-menu-left", `${position.left}px`);
    menu.style.setProperty("--lambe-menu-top", `${position.top}px`);
  };

  menu.addEventListener(
    "keydown",
    (event) => {
      event.stopPropagation();

      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        close(true);

        return;
      }

      const step = STEPS[event.key];

      if (step === undefined) return;

      event.preventDefault();

      const all = items();
      const current = all.findIndex((candidate) => candidate === shadow.activeElement);

      all[step(Math.max(current, 0), all.length)]?.focus();
    },
    options,
  );

  for (const type of ["pointerdown", "click", "contextmenu"]) {
    menu.addEventListener(
      type,
      (event) => {
        event.stopPropagation();

        if (type === "contextmenu") event.preventDefault();
      },
      options,
    );
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.composedPath().includes(menu)) close(false);
    },
    { capture: true, signal: listeners.signal },
  );
  window.addEventListener("resize", () => close(false), options);
  shadow.append(menu);

  return {
    open(anchor, state) {
      render(state);
      menu.hidden = false;
      place(anchor);
      items()[0]?.focus();
    },
    close() {
      close(true);
    },
    destroy() {
      listeners.abort();
      menu.remove();
    },
  };
}
