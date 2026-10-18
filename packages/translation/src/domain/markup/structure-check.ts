import { Result } from "@lambe/kernel/result";
import type { InlineNode } from "../block/inline-node";
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

export function checkAgainstSource(
  source: InlineNode[],
  translated: InlineNode[],
): Result<InlineNode[], MarkupError> {
  const expected = collectPlacements(source);
  const actual = collectPlacements(translated);

  for (const [id, parents] of actual) {
    if (parents.length > 1) {
      return Result.fail(
        markupError("PLACEHOLDER_DUPLICATED", `${id} appears ${parents.length} times.`),
      );
    }

    if (!expected.has(id)) {
      return Result.fail(markupError("MARKUP_MALFORMED", `${id} does not exist in the source.`));
    }
  }

  for (const [id, parents] of expected) {
    const actualParent = actual.get(id)?.[0];

    if (actualParent === undefined) {
      return Result.fail(markupError("PLACEHOLDER_LOST", `${id} is missing.`));
    }

    if (actualParent !== parents[0]) {
      return Result.fail(
        markupError("STRUCTURE_MOVED", `${id} moved from ${parents[0]} to ${actualParent}.`),
      );
    }
  }

  return Result.ok(translated);
}
