import type { BlockRole } from "../../domain/block/block";

const CHROME_ROLES = [
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "menu",
  "menubar",
  "toolbar",
  "tablist",
  "search",
  "dialog",
  "button",
  "tab",
  "menuitem",
];

const CHROME_SELECTOR = [
  "nav",
  "aside",
  "menu",
  "dialog",
  "button",
  "label",
  "select",
  ...CHROME_ROLES.map((role) => `[role~="${role}"]`),
].join(", ");

const PAGE_BAND_SELECTOR = "header, footer";

const SECTIONING_SELECTOR = 'main, article, section, [role~="main"]';

const ARTICLE_SELECTOR =
  'article, [role~="article"], .markdown-body, [itemprop~="text"], [itemprop~="articleBody"]';

const INTERACTIVE_SELECTOR = "a, button";

const elementOf = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement;

function inPageBand(el: Element): boolean {
  for (let band = el.closest(PAGE_BAND_SELECTOR); band; ) {
    if (!band.parentElement?.closest(SECTIONING_SELECTOR)) return true;

    band = band.parentElement.closest(PAGE_BAND_SELECTOR);
  }

  return false;
}

function onlyInteractiveText(textNodes: Text[]): boolean {
  const filled = textNodes.filter((text) => (text.nodeValue ?? "").trim() !== "");

  if (filled.length === 0) return false;

  return filled.every((text) => text.parentElement?.closest(INTERACTIVE_SELECTOR));
}

export function blockRole(first: Node, textNodes: Text[]): BlockRole {
  const el = elementOf(first);

  if (el?.closest(CHROME_SELECTOR) || (el && inPageBand(el))) return "chrome";

  if (el?.closest(ARTICLE_SELECTOR)) return "article";

  return onlyInteractiveText(textNodes) ? "chrome" : "content";
}
