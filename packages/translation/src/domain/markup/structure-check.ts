import { Result } from "@lambe/kernel/result";
import { letterCount } from "../block/block-translation";
import { appendNode, type InlineNode } from "../block/inline-node";
import { reinsertAtom, relativeAtomPosition } from "./atom-reinsertion";
import { type MarkupError, markupError } from "./markup";

const ROOT = "root";

type Placements = Map<string, string[]>;

function placeholderId(node: InlineNode): string | undefined {
  if (node.kind === "atom") return `<x${node.key}/>`;

  if (node.kind === "group") return `<g${node.key}>`;

  return undefined;
}

function collectPlacements(
  nodes: InlineNode[],
  parent: string = ROOT,
  placements: Placements = new Map(),
): Placements {
  for (const node of nodes) {
    const id = placeholderId(node);

    if (id === undefined) continue;

    placements.set(id, [...(placements.get(id) ?? []), parent]);

    if (node.kind === "group") collectPlacements(node.children, id, placements);
  }

  return placements;
}

function withoutLeadingPhantomAtom(expected: Placements, translated: InlineNode[]): InlineNode[] {
  const [head, next, ...rest] = translated;

  if (head?.kind !== "atom" || expected.has(`<x${head.key}/>`)) return translated;

  if (next?.kind !== "text") return translated.slice(1);

  const text = next.text.trimStart();

  return text === "" ? rest : [{ kind: "text", text }, ...rest];
}

interface Settling {
  expected: Placements;
  kept: Set<string>;
  atoms: Placements;
}

function settleGroups(nodes: InlineNode[], parent: string, settling: Settling): InlineNode[] {
  return nodes
    .flatMap((node): InlineNode[] => {
      if (node.kind === "text") return [node];

      const id = placeholderId(node) ?? "";

      if (node.kind === "atom") {
        settling.atoms.set(id, [...(settling.atoms.get(id) ?? []), parent]);

        return [node];
      }

      const inPlace = settling.expected.get(id)?.[0] === parent && !settling.kept.has(id);

      if (!inPlace) return settleGroups(node.children, parent, settling);

      settling.kept.add(id);

      return [{ ...node, children: settleGroups(node.children, id, settling) }];
    })
    .reduce(appendNode, []);
}

function atomError(expected: Placements, atoms: Placements): MarkupError | undefined {
  for (const [id, parents] of atoms) {
    if (parents.length > 1)
      return markupError("PLACEHOLDER_DUPLICATED", `${id} appears ${parents.length} times.`);

    if (!expected.has(id))
      return markupError("MARKUP_MALFORMED", `${id} does not exist in the source.`);
  }

  for (const [id, parents] of expected) {
    if (!id.startsWith("<x")) continue;

    const actualParent = atoms.get(id)?.[0];

    if (actualParent !== undefined && actualParent !== parents[0])
      return markupError("STRUCTURE_MOVED", `${id} moved from ${parents[0]} to ${actualParent}.`);
  }

  return undefined;
}

interface SourceAtom {
  key: number;
  parent: string;
  siblings: InlineNode[];
}

function sourceAtoms(nodes: InlineNode[], parent: string = ROOT): SourceAtom[] {
  return nodes.flatMap((node) => {
    if (node.kind === "atom") return [{ key: node.key, parent, siblings: nodes }];

    if (node.kind === "group") return sourceAtoms(node.children, `<g${node.key}>`);

    return [];
  });
}

function withChildren(
  nodes: InlineNode[],
  parent: string,
  update: (children: InlineNode[]) => InlineNode[],
): InlineNode[] {
  if (parent === ROOT) return update(nodes);

  return nodes.map((node) => {
    if (node.kind !== "group") return node;

    if (placeholderId(node) === parent) return { ...node, children: update(node.children) };

    return { ...node, children: withChildren(node.children, parent, update) };
  });
}

function reinsertLostAtoms(
  source: InlineNode[],
  translated: InlineNode[],
  settling: Settling,
): Result<InlineNode[], MarkupError> {
  let repaired = translated;

  for (const { key, parent, siblings } of sourceAtoms(source)) {
    const id = `<x${key}/>`;

    if (settling.atoms.has(id)) continue;

    if (parent !== ROOT && !settling.kept.has(parent))
      return Result.fail(markupError("PLACEHOLDER_LOST", `${id} is missing.`));

    const position = relativeAtomPosition(siblings, key);

    repaired = withChildren(repaired, parent, (children) => reinsertAtom(children, key, position));
  }

  return Result.ok(repaired);
}

const SPARSE_GROUPS = 2;

function tooManyLost(lost: number, groups: number): boolean {
  if (groups <= SPARSE_GROUPS) return lost > 0;

  return lost * 2 > groups;
}

function groupIds(placements: Placements): string[] {
  return [...placements.keys()].filter((id) => id.startsWith("<g"));
}

export function missingGroups(source: InlineNode[], translated: InlineNode[]): number {
  const present = collectPlacements(translated);

  return groupIds(collectPlacements(source)).filter((id) => !present.has(id)).length;
}

export function settleAgainstSource(
  source: InlineNode[],
  answer: InlineNode[],
): Result<InlineNode[], MarkupError> {
  const expected = collectPlacements(source);
  const settling: Settling = { expected, kept: new Set(), atoms: new Map() };
  const settled = settleGroups(withoutLeadingPhantomAtom(expected, answer), ROOT, settling);
  const atomFailure = atomError(expected, settling.atoms);

  if (atomFailure !== undefined) return Result.fail(atomFailure);

  const repaired = reinsertLostAtoms(source, settled, settling);

  if (repaired.isFailure) return Result.fail(repaired.getError());

  const translated = repaired.getValue();

  if (letterCount(source) > 0 && letterCount(translated) === 0)
    return Result.fail(markupError("TRANSLATION_EMPTY", "The translation has no text."));

  const groups = groupIds(expected).length;
  const lost = groups - settling.kept.size;

  if (tooManyLost(lost, groups))
    return Result.fail(markupError("PLACEHOLDER_LOST", `${lost} of ${groups} groups are missing.`));

  return Result.ok(translated);
}
