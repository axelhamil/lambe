const EXCLUDED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "pre",
  "code",
  "kbd",
  "samp",
  "var",
  "textarea",
  "input",
  "select",
  "svg",
  "math",
]);

const HIDDEN_SELECTOR = "[hidden], .sr-only, .visually-hidden, .screen-reader-text";

const MEDIAWIKI_EXCLUDED_SELECTOR = ".mw-editsection";

const EXCLUDED_ATTRIBUTES_SELECTOR = `[contenteditable], [translate="no"], .notranslate, ${HIDDEN_SELECTOR}, ${MEDIAWIKI_EXCLUDED_SELECTOR}`;

export const EXCLUDED_SELECTOR = `${[...EXCLUDED_TAGS].join(", ")}, ${EXCLUDED_ATTRIBUTES_SELECTOR}`;

const COMMENT_PERMEABLE_TAGS = new Set(["pre", "code"]);

export const HARD_EXCLUDED_SELECTOR = `${[...EXCLUDED_TAGS]
  .filter((tag) => !COMMENT_PERMEABLE_TAGS.has(tag))
  .join(", ")}, [contenteditable]`;

const PROTECTED_INLINE_TAGS = new Set([
  "code",
  "kbd",
  "samp",
  "var",
  "img",
  "br",
  "wbr",
  "svg",
  "math",
  "picture",
  "video",
  "audio",
  "canvas",
  "iframe",
  "object",
  "embed",
  "template",
]);

const URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+$/i;

const ANCHORED_PATH_PATTERN = /^(?:\/|\.{1,2}\/|~\/)\S*$/;

const DOTTED_PATH_PATTERN = /^[\w@-]+(?:\.[\w@-]+)*(?:\/[\w.@-]+)+\/?$/;

const hasDottedSegment = (text: string): boolean =>
  text.split("/").some((segment) => /\w\.\w/.test(segment));

function endsTheHrefPath(anchor: Element, text: string): boolean {
  const href = anchor.getAttribute("href") ?? "";

  if (!text.includes("/") || !URL.canParse(href)) return false;

  return new URL(href).pathname.replace(/\/$/, "").endsWith(`/${text}`);
}

function looksLikeUrlOrPath(anchor: Element, text: string): boolean {
  if (URL_PATTERN.test(text) || ANCHORED_PATH_PATTERN.test(text)) return true;

  if (DOTTED_PATH_PATTERN.test(text) && hasDottedSegment(text)) return true;

  return endsTheHrefPath(anchor, text);
}

const CITATION_MARK = /^\[[^[\]]{1,8}\]$/;

function isCitation(el: Element): boolean {
  if (el.localName !== "sup") return false;

  return el.classList.contains("reference") || CITATION_MARK.test((el.textContent ?? "").trim());
}

const atMostAPixel = (length: string): boolean => Number.parseFloat(length) <= 1;

function clipsToNothing(clip: string): boolean {
  const [top = Number.NaN, right = Number.NaN, bottom = Number.NaN, left = Number.NaN] =
    /^rect\((.*)\)$/
      .exec(clip.trim())?.[1]
      ?.split(/[\s,]+/)
      .map((edge) => Number.parseFloat(edge)) ?? [];

  return right <= left || bottom <= top;
}

function isScreenReaderOnly(style: CSSStyleDeclaration): boolean {
  if (style.position !== "absolute" && style.position !== "fixed") return false;

  if (clipsToNothing(style.clip) || /^inset\(\s*50%/.test(style.clipPath)) return true;

  return (
    (style.overflow === "hidden" || style.overflow === "clip") &&
    atMostAPixel(style.width) &&
    atMostAPixel(style.height)
  );
}

function isVisuallyHidden(el: Element): boolean {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);

  if (!style) return false;

  if (style.display === "none" || style.visibility === "hidden") return true;

  return isScreenReaderOnly(style);
}

export function isExcluded(el: Element): boolean {
  if (EXCLUDED_TAGS.has(el.localName)) return true;

  return el.matches(EXCLUDED_ATTRIBUTES_SELECTOR) || isVisuallyHidden(el);
}

export function isInHiddenSubtree(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement)
    if (node.matches(HIDDEN_SELECTOR) || isVisuallyHidden(node)) return true;

  return false;
}

export function isProtectedInline(el: Element): boolean {
  if (PROTECTED_INLINE_TAGS.has(el.localName) || isCitation(el)) return true;

  if (el.localName !== "a") return false;

  return looksLikeUrlOrPath(el, (el.textContent ?? "").trim());
}
