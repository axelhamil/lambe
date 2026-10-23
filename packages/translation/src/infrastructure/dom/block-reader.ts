import type { Block } from "../../domain/block/block";
import { textSlots } from "../../domain/block/block-translation";
import type { InlineNode } from "../../domain/block/inline-node";
import type { BlockId } from "../../domain/block/value-objects/block-id.vo";
import { splitCommentMarker } from "../../domain/markup/comment-marker";
import { blockRole } from "./block-role";
import {
  EXCLUDED_SELECTOR,
  HARD_EXCLUDED_SELECTOR,
  isExcluded,
  isProtectedInline,
} from "./protected-nodes";

export interface CommentAffix {
  prefix: string;
  suffix: string;
  separators: string[];
  lineLengths: number[];
}

export interface ReadBlock {
  block: Block;
  scope: Node[];
  atoms: Map<number, Node>;
  groups: Map<number, Element>;
  carriers: Map<Node, Node>;
  inert: Set<Text>;
  textNodes: Text[];
  commentAffixes: Map<Text, CommentAffix>;
}

const BLOCK_TAGS = [
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "legend",
  "li",
  "main",
  "menu",
  "nav",
  "ol",
  "optgroup",
  "option",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
];

const BLOCK_TAG_SET = new Set(BLOCK_TAGS);

const BLOCK_SELECTOR = BLOCK_TAGS.join(", ");

const SKIPPED_CONTAINERS = new Set(["head", "template", "datalist", "option"]);

const SKIPPED_SELECTOR = [...SKIPPED_CONTAINERS].join(", ");

const CODE_CONTAINER_SELECTOR = "pre, code";

const COMMENT_SELECTOR =
  '.pl-c, .hljs-comment, .token.comment, .cm-comment, .tok-comment, [class~="comment"]';

const ASCII_WHITESPACE_RUN = /[\t\n\f\r ]+/g;

const ASCII_BLANK = /^[\t\n\f\r ]*$/;

const LETTER = /\p{L}/u;

const BLANK = /^\s*$/u;

const WRAPPER_TAGS = new Set(["span", "font"]);

const HELD_ATTRIBUTE = /^(?:style|hidden|role|lang|dir|aria-.+)$/;

const collapseWhitespace = (text: string): string => text.replace(ASCII_WHITESPACE_RUN, " ");

const hasLetter = (nodes: InlineNode[]): boolean => LETTER.test(textSlots(nodes).join(""));

const isBlank = (node: Node): boolean =>
  node instanceof Text && ASCII_BLANK.test(node.nodeValue ?? "");

function trimBlankEdges(run: ChildNode[]): ChildNode[] {
  const start = run.findIndex((node) => !isBlank(node));

  if (start === -1) return [];

  const end = run.findLastIndex((node) => !isBlank(node));

  return run.slice(start, end + 1);
}

function commentAffix(value: string): { body: string; affix: CommentAffix } | undefined {
  const lines = value.split("\n").map(splitCommentMarker);
  const kept = lines.flatMap((line, index) => (ASCII_BLANK.test(line.body) ? [] : [index]));
  const first = kept[0];
  const last = kept[kept.length - 1];

  if (first === undefined || last === undefined) return undefined;

  const raw = value.split("\n");
  const head = raw
    .slice(0, first)
    .map((line) => `${line}\n`)
    .join("");
  const tail = raw
    .slice(last + 1)
    .map((line) => `\n${line}`)
    .join("");
  const span = lines.slice(first, last + 1);

  const separators = span
    .slice(1)
    .map((line, index) => `${span[index]?.suffix ?? ""}\n${line.prefix}`);

  return {
    body: span
      .map((line) => line.body)
      .filter((body) => !ASCII_BLANK.test(body))
      .join(" "),
    affix: {
      prefix: `${head}${span[0]?.prefix ?? ""}`,
      suffix: `${span[span.length - 1]?.suffix ?? ""}${tail}`,
      separators,
      lineLengths: span.map((line) => (ASCII_BLANK.test(line.body) ? 0 : line.body.length)),
    },
  };
}

function isOutermostCodeComment(comment: Element): boolean {
  if (comment.matches(CODE_CONTAINER_SELECTOR) || comment.closest(HARD_EXCLUDED_SELECTOR))
    return false;

  const container = comment.parentElement?.closest(CODE_CONTAINER_SELECTOR);

  if (!container) return false;

  const outer = comment.parentElement?.closest(COMMENT_SELECTOR);

  return !outer || outer === container || !container.contains(outer);
}

interface Wrapper {
  element: Element;
  bare: boolean;
  texts: Text[];
}

const isAtom = (el: Element): boolean => isExcluded(el) || isProtectedInline(el);

function isBlankElement(el: Element): boolean {
  return [...el.childNodes].every((child) => {
    if (child instanceof Text) return BLANK.test(child.data);

    return !(child instanceof Element) || (!isAtom(child) && isBlankElement(child));
  });
}

function innermost(el: Element): Element {
  const [only, ...others] = el.childNodes;

  if (others.length > 0 || !(only instanceof Element) || isAtom(only) || isBlankElement(only))
    return el;

  return innermost(only);
}

function chainOf(outer: Element, inner: Element): Element[] {
  const chain: Element[] = [];

  for (let el: Element | null = inner; el && el !== outer; el = el.parentElement) chain.push(el);

  return [...chain, outer];
}

const isPlainWrapper = (el: Element): boolean =>
  WRAPPER_TAGS.has(el.localName) &&
  !el.getAttributeNames().some((name) => HELD_ATTRIBUTE.test(name));

function textsUnder(node: Node): Text[] {
  return [...node.childNodes].flatMap((child) =>
    child instanceof Text ? [child] : textsUnder(child),
  );
}

class RunBuilder {
  readonly atoms = new Map<number, Node>();
  readonly groups = new Map<number, Element>();
  readonly carriers = new Map<Node, Node>();
  readonly inert = new Set<Text>();
  readonly textNodes: Text[] = [];
  private readonly wrappers = new Map<number, Wrapper>();
  private nextKey = 0;

  nodesOf(children: Iterable<Node>): InlineNode[] {
    const nodes = [...children].flatMap((child) => this.nodeOf(child));

    const out: InlineNode[] = [];

    nodes.forEach((node, index) => {
      out.push(...this.unwrapped(node, out.at(-1), nodes[index + 1]));
    });

    return out;
  }

  private nodeOf(node: Node): InlineNode[] {
    if (node instanceof Text) {
      this.textNodes.push(node);

      return [{ kind: "text", text: collapseWhitespace(node.nodeValue ?? "") }];
    }

    if (!(node instanceof Element)) return [];

    this.nextKey += 1;
    const key = this.nextKey;

    if (isAtom(node)) {
      this.atoms.set(key, node);

      return [{ kind: "atom", key }];
    }

    if (isBlankElement(node)) return this.blank(node);

    const inner = innermost(node);
    const start = this.textNodes.length;
    this.groups.set(key, inner);

    if (inner !== node) this.carriers.set(inner, node);

    const children = this.nodesOf(inner.childNodes);
    const texts = this.textNodes.slice(start);

    if (this.isWrapper(node, inner, children, texts)) {
      const bare = chainOf(node, inner).every((el) => el.attributes.length === 0);
      this.wrappers.set(key, { element: node, bare, texts });
    }

    return [{ kind: "group", key, children }];
  }

  private blank(el: Element): InlineNode[] {
    const texts = textsUnder(el);

    for (const text of texts) {
      this.textNodes.push(text);
      this.inert.add(text);
    }

    return texts.map((text) => ({ kind: "text", text: collapseWhitespace(text.data) }));
  }

  private isWrapper(
    outer: Element,
    inner: Element,
    children: InlineNode[],
    texts: Text[],
  ): boolean {
    if (!chainOf(outer, inner).every(isPlainWrapper)) return false;

    if (!children.every((child) => child.kind === "text")) return false;

    return texts.filter((text) => !this.inert.has(text)).length === 1;
  }

  private unwrapped(
    node: InlineNode,
    previous: InlineNode | undefined,
    next: InlineNode | undefined,
  ): InlineNode[] {
    const wrapper = node.kind === "group" ? this.wrappers.get(node.key) : undefined;

    if (node.kind !== "group" || wrapper === undefined) return [node];

    if (!wrapper.bare && (previous?.kind === "text" || next?.kind === "text")) return [node];

    const inner = this.groups.get(node.key);

    if (inner) this.carriers.delete(inner);

    this.groups.delete(node.key);

    for (const text of wrapper.texts) this.carriers.set(text, wrapper.element);

    return node.children;
  }
}

export class BlockReader {
  private readonly claimed = new WeakSet<Text>();

  public constructor(
    private readonly doc: Document,
    private readonly ids: () => BlockId,
  ) {}

  public read(root: ParentNode): ReadBlock[] {
    const out: ReadBlock[] = [];

    if (root instanceof Element && root.closest(SKIPPED_SELECTOR)) return out;

    if (root instanceof Element && root.closest(EXCLUDED_SELECTOR)) {
      this.readComments(root, out);

      return out;
    }

    this.visit(root, out);

    return out;
  }

  private visit(container: ParentNode, out: ReadBlock[]): void {
    let run: ChildNode[] = [];

    for (const child of [...container.childNodes]) {
      if (child instanceof Text) {
        run.push(child);
        continue;
      }

      if (!(child instanceof Element)) continue;

      if (!this.isBlockLike(child)) {
        run.push(child);
        continue;
      }

      this.flush(run, out);
      run = [];
      this.visitBlock(child, out);
    }

    this.flush(run, out);
  }

  private isBlockLike(el: Element): boolean {
    if (BLOCK_TAG_SET.has(el.localName) || SKIPPED_CONTAINERS.has(el.localName)) return true;

    if (isExcluded(el) || isProtectedInline(el)) return false;

    return el.querySelector(BLOCK_SELECTOR) !== null;
  }

  private visitBlock(el: Element, out: ReadBlock[]): void {
    if (SKIPPED_CONTAINERS.has(el.localName)) return;

    if (el.matches(HARD_EXCLUDED_SELECTOR)) return;

    if (isExcluded(el)) {
      this.readComments(el, out);

      return;
    }

    this.visit(el, out);
  }

  private flush(run: ChildNode[], out: ReadBlock[]): void {
    const scope = trimBlankEdges(run);
    const [first] = scope;

    if (first === undefined) return;

    const builder = new RunBuilder();
    const nodes = builder.nodesOf(scope);

    if (!hasLetter(nodes) || this.anyClaimed(builder.textNodes)) return;

    this.claim(builder.textNodes);
    out.push({
      block: { id: this.ids(), nodes, role: blockRole(first, builder.textNodes) },
      scope,
      atoms: builder.atoms,
      groups: builder.groups,
      carriers: builder.carriers,
      inert: builder.inert,
      textNodes: builder.textNodes,
      commentAffixes: new Map(),
    });
  }

  private anyClaimed(texts: Text[]): boolean {
    return texts.some((text) => this.claimed.has(text));
  }

  private claim(texts: Text[]): void {
    for (const text of texts) this.claimed.add(text);
  }

  private readComments(within: Element, out: ReadBlock[]): void {
    const enclosing = within.closest(COMMENT_SELECTOR);
    const candidates = [
      ...(enclosing ? [enclosing] : []),
      ...within.querySelectorAll(COMMENT_SELECTOR),
    ];

    for (const comment of candidates) {
      if (isOutermostCodeComment(comment)) this.readComment(comment, out);
    }
  }

  private readComment(comment: Element, out: ReadBlock[]): void {
    const walker = this.doc.createTreeWalker(comment, NodeFilter.SHOW_TEXT);
    const nodes: InlineNode[] = [];
    const textNodes: Text[] = [];
    const commentAffixes = new Map<Text, CommentAffix>();

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) continue;

      const split = commentAffix(node.nodeValue ?? "");

      if (!split) continue;

      nodes.push({ kind: "text", text: split.body });
      textNodes.push(node);
      commentAffixes.set(node, split.affix);
    }

    if (!hasLetter(nodes) || this.anyClaimed(textNodes)) return;

    this.claim(textNodes);
    out.push({
      block: { id: this.ids(), nodes, role: "content" },
      scope: [comment],
      atoms: new Map(),
      groups: new Map(),
      carriers: new Map(),
      inert: new Set(),
      textNodes,
      commentAffixes,
    });
  }
}
