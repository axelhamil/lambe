import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { Block } from "../../domain/block/block";
import type { BlockTranslation } from "../../domain/block/block-translation";
import type { InlineNode } from "../../domain/block/inline-node";
import { BlockId } from "../../domain/block/value-objects/block-id.vo";
import { BlockReader, type ReadBlock } from "./block-reader";
import type { WatcherPorts } from "./block-watcher";
import { DomPageSurface } from "./dom-page-surface";

const PROTECTED_SELECTOR = "pre, code, kbd, samp, svg";

const COMMENT_SELECTOR = ".pl-c, .hljs-comment";

type Scope = Record<string, unknown>;

const loadFixture = async (name: string): Promise<{ doc: Document; scope: Scope }> => {
  const html = await readFile(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scope: Scope = {};

  for (const script of doc.querySelectorAll("script")) {
    new Function("window", "document", "NodeFilter", script.textContent ?? "")(
      scope,
      doc,
      NodeFilter,
    );
  }

  return { doc, scope };
};

const idSource = (): (() => BlockId) => {
  let next = 0;

  return () => {
    next += 1;

    return BlockId.create(`b${next}`).getValue();
  };
};

const silentPorts = (): WatcherPorts => ({
  mutations: () => ({ observe: () => {}, takeRecords: () => [], disconnect: () => {} }),
  intersections: () => ({ observe: () => {}, unobserve: () => {}, disconnect: () => {} }),
  nextFrame: (callback) => callback(),
  viewportHeight: () => 800,
});

interface Setup {
  doc: Document;
  scope: Scope;
  surface: DomPageSurface;
  blocks: Block[];
  reads: ReadBlock[];
}

const setup = async (name: string): Promise<Setup> => {
  const { doc, scope } = await loadFixture(name);
  const reads = new BlockReader(doc, idSource()).read(doc);
  const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: silentPorts() });
  const blocks = surface.scan();

  return { doc, scope, surface, blocks, reads };
};

const bodySurface = (body: string): { doc: Document; surface: DomPageSurface; blocks: Block[] } => {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${body}</body></html>`,
    "text/html",
  );
  const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: silentPorts() });

  return { doc, surface, blocks: surface.scan() };
};

const rewrite = (nodes: InlineNode[], dropFirstText: boolean): InlineNode[] => {
  const mapped = nodes.map((node): InlineNode => {
    if (node.kind === "text") return { kind: "text", text: `T${node.text}` };

    if (node.kind === "group") return { ...node, children: rewrite(node.children, false) };

    return node;
  });
  const firstText = mapped.findIndex((node) => node.kind === "text");
  const textCount = mapped.filter((node) => node.kind === "text").length;
  const kept =
    dropFirstText && textCount > 1 ? mapped.filter((_, index) => index !== firstText) : mapped;

  return [...kept.reverse(), { kind: "text", text: " +" }];
};

const translationOf = (block: Block, index: number): BlockTranslation => ({
  blockId: block.id,
  kind: "structured",
  nodes: rewrite(block.nodes, index % 2 === 1),
});

const commitAll = (surface: DomPageSurface, blocks: Block[]): void => {
  blocks.forEach((block, index) => {
    surface.commit(translationOf(block, index));
  });
};

const elementCount = (doc: Document): number => doc.getElementsByTagName("*").length;

const allTextNodes = (doc: Document): Text[] => {
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) out.push(node);
  }

  return out;
};

const protectedHtml = (doc: Document): string[] =>
  [...doc.querySelectorAll(PROTECTED_SELECTOR)].map((el) => el.outerHTML);

const withoutCommentText = (el: Element): string => {
  const copy = el.cloneNode(true);

  if (!(copy instanceof Element)) return "";

  for (const comment of copy.querySelectorAll(COMMENT_SELECTOR)) {
    for (const text of allTextNodesUnder(comment)) text.data = "";
  }

  return copy.outerHTML;
};

const allTextNodesUnder = (root: Node): Text[] =>
  [...root.childNodes].flatMap((child) =>
    child instanceof Text ? [child] : allTextNodesUnder(child),
  );

const positionOf = (node: Node): number =>
  Array.from<Node>(node.parentNode?.childNodes ?? []).indexOf(node);

describe("DomPageSurface commit and restore", () => {
  test("commit_translated_then_show_original_restores_outerHTML_byte_for_byte", async () => {
    const { doc, surface, blocks } = await setup("github-fork-a-repo.html");
    const before = doc.documentElement.outerHTML;

    commitAll(surface, blocks);
    const translated = doc.documentElement.outerHTML;
    surface.show("original");

    expect(blocks.length).toBeGreaterThan(20);
    expect(translated === before).toBe(false);
    expect(doc.documentElement.outerHTML === before).toBe(true);
  });

  test("commit_applies_immediately_even_after_show_original", async () => {
    const { doc, surface, blocks } = await setup("github-fork-a-repo.html");
    const block = blocks.find((candidate) => candidate.nodes.some((node) => node.kind === "text"));

    surface.show("original");
    if (block) surface.commit({ blockId: block.id, kind: "text-slots", texts: ["Bonjour"] });

    expect(block).toBeDefined();
    expect(doc.body.textContent?.includes("Bonjour")).toBe(true);
  });

  test("recommit_after_show_original_replaces_the_stored_translation", async () => {
    const { doc, surface, blocks } = await setup("react-like-page.html");
    const heading = blocks[0];
    const before = doc.documentElement.outerHTML;

    if (heading) {
      surface.commit({ blockId: heading.id, kind: "text-slots", texts: ["Premier"] });
      surface.show("original");
      surface.commit({ blockId: heading.id, kind: "text-slots", texts: ["Second"] });
      surface.show("original");
      surface.show("translated");
    }
    const h1 = doc.querySelector("h1")?.textContent;
    surface.show("original");

    expect(h1).toBe("Second");
    expect(doc.documentElement.outerHTML === before).toBe(true);
  });

  test("protected_nodes_are_byte_identical_after_translation_and_after_toggle_back", async () => {
    for (const name of ["github-fork-a-repo.html", "react-like-page.html"]) {
      const { doc, surface, blocks } = await setup(name);
      const elements = [...doc.querySelectorAll(PROTECTED_SELECTOR)];
      const before = protectedHtml(doc);
      const beforeStripped = elements.map(withoutCommentText).join("\n");

      commitAll(surface, blocks);
      const afterStripped = elements.map(withoutCommentText).join("\n");
      const changed = elements.filter((el, index) => el.outerHTML !== before[index]);
      surface.show("original");

      expect(elements.length).toBeGreaterThan(0);
      expect(afterStripped === beforeStripped).toBe(true);
      expect(changed.every((el) => el.querySelector(COMMENT_SELECTOR) !== null)).toBe(true);
      expect(protectedHtml(doc).join("\n") === before.join("\n")).toBe(true);
    }
  });

  test("highlighted_comment_text_is_translated_with_its_marker_kept", async () => {
    const { doc, surface, blocks } = await setup("react-like-page.html");
    const comments = blocks.filter((block) =>
      block.nodes.some((node) => node.kind === "text" && node.text.includes("merge the default")),
    );

    for (const block of comments) {
      surface.commit({ blockId: block.id, kind: "text-slots", texts: ["fusionner la branche"] });
    }
    const comment = [...doc.querySelectorAll("pre .pl-c")].find((el) =>
      el.textContent?.startsWith("/*"),
    );

    expect(comments.length).toBe(1);
    expect(comment?.textContent?.startsWith("/* fusionner")).toBe(true);
    expect(comment?.textContent?.endsWith("*/")).toBe(true);
  });

  test("toggle_twice_is_idempotent_and_makes_no_new_elements", async () => {
    const { doc, surface, blocks } = await setup("github-fork-a-repo.html");
    const original = doc.documentElement.outerHTML;
    const count = elementCount(doc);

    commitAll(surface, blocks);
    const translated = doc.documentElement.outerHTML;
    const counts: number[] = [elementCount(doc)];
    surface.show("original");
    surface.show("translated");
    counts.push(elementCount(doc));
    const translatedAgain = doc.documentElement.outerHTML;
    surface.show("translated");
    surface.show("original");
    surface.show("original");
    counts.push(elementCount(doc));

    expect(counts.join(",")).toBe([count, count, count].join(","));
    expect(translatedAgain === translated).toBe(true);
    expect(doc.documentElement.outerHTML === original).toBe(true);
  });

  test("original_text_nodes_keep_identity", async () => {
    const { doc, surface, blocks, reads } = await setup("github-fork-a-repo.html");
    const texts = reads.flatMap((read) => read.textNodes);
    const parents = texts.map((text) => text.parentNode);
    const walked = allTextNodes(doc);

    commitAll(surface, blocks);
    const parentsKept = texts.every((text, index) => text.parentNode === parents[index]);
    surface.show("original");
    surface.show("translated");
    surface.show("original");
    const after = allTextNodes(doc);

    expect(texts.length).toBeGreaterThan(50);
    expect(parentsKept).toBe(true);
    expect(after.length).toBe(walked.length);
    expect(after.every((text, index) => text === walked[index])).toBe(true);
  });

  test("reordered_groups_stay_under_the_same_parent", async () => {
    const { surface, blocks, reads } = await setup("github-fork-a-repo.html");
    const moved = reads.flatMap((read) => [...read.groups.values(), ...read.atoms.values()]);
    const parents = moved.map((node) => node.parentNode);
    const positions = moved.map((node) => positionOf(node));

    commitAll(surface, blocks);
    const sameParent = moved.every((node, index) => node.parentNode === parents[index]);
    const reordered = moved.filter((node, index) => positionOf(node) !== positions[index]);

    expect(moved.length).toBeGreaterThan(10);
    expect(sameParent).toBe(true);
    expect(reordered.length).toBeGreaterThan(0);
  });

  test("block_removed_from_dom_before_commit_returns_BLOCK_DETACHED_and_does_not_throw", async () => {
    const { doc, surface, blocks } = await setup("react-like-page.html");
    const heading = blocks[0];
    doc.querySelector("h1")?.remove();

    const result = heading && surface.commit(translationOf(heading, 0));

    expect(result?.isFailure).toBe(true);
    expect(result?.getError().code).toBe("BLOCK_DETACHED");
    expect(() => surface.show("translated")).not.toThrow();
  });

  test("framework_removeChild_on_original_text_node_does_not_throw", async () => {
    const { doc, scope, surface, blocks, reads } = await setup("react-like-page.html");
    const texts = reads.flatMap((read) => read.textNodes);
    const originals = texts.map((text) => text.data);
    const frame = scope.__frame;

    commitAll(surface, blocks);
    const rerender = () => {
      if (typeof frame === "object" && frame !== null && "rerender" in frame) {
        const run = frame.rerender;

        if (typeof run === "function") run.call(frame);
      }
    };

    expect(rerender).not.toThrow();
    const removed = texts.filter((text) => !text.isConnected);
    expect(() => surface.show("original")).not.toThrow();
    const detachedAfterOriginal = removed.every((text) => !text.isConnected);
    const restored = texts.map((text) => text.data).join("|");
    surface.show("translated");
    const detachedAfterTranslated = removed.every((text) => !text.isConnected);

    expect(removed.length).toBe(texts.length);
    expect(detachedAfterOriginal).toBe(true);
    expect(detachedAfterTranslated).toBe(true);
    expect(restored).toBe(originals.join("|"));
    expect(doc.querySelectorAll("kbd").length).toBe(2);
  });

  test("restore_is_exact_when_the_node_after_a_run_is_removed", () => {
    const { doc, surface, blocks } = bodySurface(
      '<div id="c">Hello <a>link</a> and <b>bold</b> world<div id="ad">Ad text</div></div>',
    );
    const run = blocks[0];

    if (run)
      surface.commit({ blockId: run.id, kind: "structured", nodes: [...run.nodes].reverse() });
    const translated = doc.getElementById("c")?.innerHTML;
    doc.getElementById("ad")?.remove();
    surface.show("original");

    expect(translated?.startsWith(" world<b>")).toBe(true);
    expect(doc.getElementById("c")?.innerHTML).toBe("Hello <a>link</a> and <b>bold</b> world");
  });

  test("extra_removed_by_the_framework_is_not_reinserted", () => {
    const { doc, surface, blocks } = bodySurface('<p id="p">Hello <b>x</b></p>');
    const block = blocks[0];
    const paragraph = doc.getElementById("p");

    if (block) {
      surface.commit({
        blockId: block.id,
        kind: "structured",
        nodes: [...block.nodes, { kind: "text", text: " EXTRA" }],
      });
    }
    const translated = paragraph?.innerHTML;
    paragraph?.replaceChildren(doc.createTextNode("Framework"));
    surface.show("original");
    surface.show("translated");

    expect(translated).toBe("Hello <b>x</b> EXTRA");
    expect(paragraph?.innerHTML).toBe("Framework");
  });
});
