import { Result } from "@lambe/kernel/result";
import type { GroupNode, InlineNode } from "../block/inline-node";

export type MarkupErrorCode =
  | "MARKUP_MALFORMED"
  | "PLACEHOLDER_LOST"
  | "PLACEHOLDER_DUPLICATED"
  | "STRUCTURE_MOVED";

export interface MarkupError {
  code: MarkupErrorCode;
  detail: string;
}

export function markupError(code: MarkupErrorCode, detail: string): MarkupError {
  return { code, detail };
}

const TAG_PATTERN = /<x(\d+)\/>|<g(\d+)>|<\/g(\d+)>/y;

const ENTITY_PATTERN = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g;

const MAX_CODE_POINT = 0x10ffff;

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function decodeEntity(
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined,
): string | undefined {
  if (name !== undefined) return NAMED_ENTITIES.get(name);

  const codePoint = decimal === undefined ? Number.parseInt(hex ?? "", 16) : Number(decimal);

  if (!Number.isInteger(codePoint) || codePoint > MAX_CODE_POINT) return undefined;

  return String.fromCodePoint(codePoint);
}

function unescapeText(raw: string): Result<string, MarkupError> {
  let unknown: string | undefined;

  const text = raw.replace(ENTITY_PATTERN, (entity, decimal, hex, name) => {
    const decoded = decodeEntity(decimal, hex, name);

    if (decoded === undefined) unknown ??= entity;

    return decoded ?? entity;
  });

  if (unknown !== undefined) {
    return Result.fail(markupError("MARKUP_MALFORMED", `Unknown entity ${unknown}.`));
  }

  return Result.ok(text);
}

function serialize(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return escapeText(node.text);

      if (node.kind === "atom") return `<x${node.key}/>`;

      return `<g${node.key}>${serialize(node.children)}</g${node.key}>`;
    })
    .join("");
}

export function toMarkup(nodes: InlineNode[]): string {
  return serialize(nodes)
    .replace(/[ \t\n\f\r]+/g, " ")
    .replace(/^ | $/g, "");
}

interface OpenGroup {
  key: number;
  children: InlineNode[];
}

function appendText(target: InlineNode[], raw: string): Result<void, MarkupError> {
  if (raw === "") return Result.ok();

  const decoded = unescapeText(raw);

  if (decoded.isFailure) return Result.fail(decoded.getError());

  const text = decoded.getValue();
  const last = target.at(-1);

  if (last?.kind === "text") {
    last.text += text;

    return Result.ok();
  }

  target.push({ kind: "text", text });

  return Result.ok();
}

export function parseMarkup(markup: string): Result<InlineNode[], MarkupError> {
  const root: InlineNode[] = [];
  const stack: OpenGroup[] = [];
  let cursor = 0;

  while (cursor < markup.length) {
    const tagStart = markup.indexOf("<", cursor);
    const children = stack.at(-1)?.children ?? root;
    const textEnd = tagStart === -1 ? markup.length : tagStart;
    const appended = appendText(children, markup.slice(cursor, textEnd));

    if (appended.isFailure) return Result.fail(appended.getError());

    if (tagStart === -1) break;

    TAG_PATTERN.lastIndex = tagStart;
    const tag = TAG_PATTERN.exec(markup);

    if (!tag) {
      return Result.fail(markupError("MARKUP_MALFORMED", `Unexpected "<" at offset ${tagStart}.`));
    }

    const [whole, atomKey, openKey, closeKey] = tag;
    cursor = tagStart + whole.length;

    if (atomKey !== undefined) {
      children.push({ kind: "atom", key: Number(atomKey) });
      continue;
    }

    if (openKey !== undefined) {
      stack.push({ key: Number(openKey), children: [] });
      continue;
    }

    const open = stack.pop();

    if (open?.key !== Number(closeKey)) {
      return Result.fail(markupError("MARKUP_MALFORMED", `Unmatched closing tag ${whole}.`));
    }

    const group: GroupNode = { kind: "group", key: open.key, children: open.children };
    (stack.at(-1)?.children ?? root).push(group);
  }

  const unclosed = stack.at(-1);

  if (unclosed) {
    return Result.fail(markupError("MARKUP_MALFORMED", `Group <g${unclosed.key}> is not closed.`));
  }

  return Result.ok(root);
}
