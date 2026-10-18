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

const EXCLUDED_ATTRIBUTES_SELECTOR = '[contenteditable], [translate="no"], .notranslate';

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

export function isExcluded(el: Element): boolean {
  if (EXCLUDED_TAGS.has(el.localName)) return true;

  return el.matches(EXCLUDED_ATTRIBUTES_SELECTOR);
}

export function isProtectedInline(el: Element): boolean {
  if (PROTECTED_INLINE_TAGS.has(el.localName) || isCitation(el)) return true;

  if (el.localName !== "a") return false;

  return looksLikeUrlOrPath(el, (el.textContent ?? "").trim());
}
