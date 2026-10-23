import { Result } from "@lambe/kernel/result";
import type {
  PageSurface,
  SurfaceListener,
  SurfaceView,
} from "../../application/ports/page-surface";
import type { Block } from "../../domain/block/block";
import { type BlockTranslation, textSlots } from "../../domain/block/block-translation";
import type { InlineNode } from "../../domain/block/inline-node";
import type { BlockId } from "../../domain/block/value-objects/block-id.vo";
import { reflowLines } from "../../domain/markup/comment-reflow";
import type { PageBrief } from "../../domain/page/page-brief";
import { BlockReader, type CommentAffix, type ReadBlock } from "./block-reader";
import { BlockWatcher, browserWatcherPorts, type WatcherPorts } from "./block-watcher";
import { readPageBrief } from "./page-brief-reader";

export interface DomPageSurfaceDeps {
  doc: Document;
  window: Window;
  ids: () => BlockId;
  observers?: WatcherPorts;
}

interface Arrangement {
  parent: Node;
  nodes: Node[];
  extras: ReadonlySet<Node>;
}

interface Layout {
  arrangements: Arrangement[];
  data: Map<Text, string>;
  dropped: Node[];
}

interface Patch {
  original: Layout;
  translated: Layout;
  extras: Text[];
  parked: WeakSet<Node>;
}

const NO_EXTRAS: ReadonlySet<Node> = new Set();

function rangeOf(scope: Node[]): Node[] {
  const first = scope[0];
  const last = scope[scope.length - 1];
  const nodes: Node[] = [];

  for (let node: Node | null = first ?? null; node; node = node.nextSibling) {
    nodes.push(node);

    if (node === last) break;
  }

  return nodes;
}

function snapshot(read: ReadBlock): Layout {
  const data = new Map(read.textNodes.map((text): [Text, string] => [text, text.data]));

  if (read.commentAffixes.size > 0) return { arrangements: [], data, dropped: [] };

  const nodes = rangeOf(read.scope);
  const parent = nodes[0]?.parentNode;
  const groups = [...read.groups.values()].map(
    (group): Arrangement => ({
      parent: group,
      nodes: [...group.childNodes],
      extras: NO_EXTRAS,
    }),
  );

  if (!parent) return { arrangements: groups, data, dropped: [] };

  return { arrangements: [{ parent, nodes, extras: NO_EXTRAS }, ...groups], data, dropped: [] };
}

function commentText(affix: CommentAffix, translation: string): string {
  const lines = reflowLines(translation, affix.lineLengths);
  const body = lines
    .map((line, index) => (index === 0 ? line : `${affix.separators[index - 1] ?? ""}${line}`))
    .join("");

  return `${affix.prefix}${body}${affix.suffix}`;
}

function slotLayout(read: ReadBlock, texts: string[]): Layout {
  const data = new Map<Text, string>();

  read.textNodes.forEach((node, index) => {
    const text = texts[index];

    if (text === undefined) return;

    const affix = read.commentAffixes.get(node);
    data.set(node, affix ? commentText(affix, text) : text);
  });

  return { arrangements: [], data, dropped: [] };
}

function keptInPlace(original: Node[], placed: Node[], rest: Node[]): Node[] {
  return rest.reduce((nodes, node) => {
    const before = original
      .slice(0, original.indexOf(node))
      .findLast((candidate) => nodes.includes(candidate));
    const at = before === undefined ? 0 : nodes.indexOf(before) + 1;

    return [...nodes.slice(0, at), node, ...nodes.slice(at)];
  }, placed);
}

class StructuredLayout {
  private readonly arrangements: Arrangement[] = [];
  private readonly data = new Map<Text, string>();
  private readonly visited = new Set<Node>();
  private readonly dropped: Node[] = [];
  private readonly carried = new Map<Node, Text>();
  readonly extras: Text[] = [];

  public constructor(
    private readonly doc: Document,
    private readonly read: ReadBlock,
    private readonly original: Layout,
    private readonly parked: WeakSet<Node>,
  ) {
    for (const [node, carrier] of read.carriers) {
      if (node instanceof Text && !read.inert.has(node)) this.carried.set(carrier, node);
    }
  }

  public build(nodes: InlineNode[]): Layout {
    const scope = this.original.arrangements[0];

    for (const text of this.read.inert) this.data.set(text, "");

    if (scope) this.arrange(scope, nodes);

    return { arrangements: this.arrangements, data: this.data, dropped: this.dropped };
  }

  private arrange(container: Arrangement, children: InlineNode[]): void {
    const own = new Set(container.nodes);
    const pool = container.nodes.flatMap((node) => this.poolOf(node));
    const extras = new Set<Node>();
    const placed: Node[] = [];

    for (const child of children) {
      if (child.kind === "text") {
        const text = pool.shift() ?? this.extra(extras);
        this.data.set(text, child.text);
        placed.push(this.anchorOf(text));
        continue;
      }

      const node =
        child.kind === "atom" ? this.read.atoms.get(child.key) : this.read.groups.get(child.key);

      if (!node || this.visited.has(node)) continue;

      this.visited.add(node);

      if (own.has(this.anchorOf(node))) placed.push(this.anchorOf(node));

      if (child.kind === "group") this.arrangeGroup(node, child.children);
    }

    for (const text of pool) this.data.set(text, "");

    const placedSet = new Set(placed);
    const groups = new Set([...this.read.groups.values()].map((group) => this.anchorOf(group)));
    const unplaced = container.nodes.filter((node) => !placedSet.has(node));
    const rest = unplaced.filter((node) => !groups.has(node));

    this.dropped.push(...unplaced.filter((node) => groups.has(node)));

    this.arrangements.push({
      ...container,
      nodes: keptInPlace(container.nodes, placed, rest),
      extras,
    });
  }

  private poolOf(node: Node): Text[] {
    if (node instanceof Text) return this.read.inert.has(node) ? [] : [node];

    const carried = this.carried.get(node);

    return carried ? [carried] : [];
  }

  private anchorOf(node: Node): Node {
    return this.read.carriers.get(node) ?? node;
  }

  private arrangeGroup(group: Node, children: InlineNode[]): void {
    const container = this.original.arrangements.find(
      (arrangement) => arrangement.parent === group,
    );

    if (container) this.arrange(container, children);
  }

  private extra(extras: Set<Node>): Text {
    const text = this.doc.createTextNode("");
    this.extras.push(text);
    this.parked.add(text);
    extras.add(text);

    return text;
  }
}

function referenceAfter(arrangement: Arrangement): Node | null | undefined {
  const { parent, nodes, extras } = arrangement;
  const members = new Set(nodes);
  const attached = nodes.filter((node) => node.parentNode === parent);

  if (!attached.some((node) => !extras.has(node))) return undefined;

  const last = [...parent.childNodes].findLast((child) => members.has(child));

  return last?.nextSibling ?? null;
}

function place(arrangement: Arrangement, parked: WeakSet<Node>): void {
  const { parent, nodes } = arrangement;
  let ref = referenceAfter(arrangement);

  if (ref === undefined) return;

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];

    if (!node) continue;

    const reinsert = node.parentNode === null && parked.has(node);

    if (node.parentNode !== parent && !reinsert) continue;

    if (reinsert || node.nextSibling !== ref) parent.insertBefore(node, ref);

    parked.delete(node);
    ref = node;
  }
}

function apply(layout: Layout, parked: WeakSet<Node>): void {
  for (const [text, value] of layout.data) {
    if (text.data !== value) text.data = value;
  }

  for (const node of layout.dropped) {
    if (!node.parentNode) continue;

    node.parentNode.removeChild(node);
    parked.add(node);
  }

  for (const arrangement of layout.arrangements) place(arrangement, parked);
}

function restore(patch: Patch): void {
  for (const extra of patch.extras) {
    if (!extra.parentNode) continue;

    extra.parentNode.removeChild(extra);
    patch.parked.add(extra);
  }

  apply(patch.original, patch.parked);
}

export class DomPageSurface implements PageSurface {
  private readonly reader: BlockReader;
  private readonly reads = new Map<string, ReadBlock>();
  private readonly originals = new Map<string, Layout>();
  private readonly patches = new Map<string, Patch>();
  private readonly originalData = new WeakMap<Node, string>();
  private readonly addedTexts = new WeakSet<Node>();
  private watcher: BlockWatcher | undefined;

  public constructor(private readonly deps: DomPageSurfaceDeps) {
    this.reader = new BlockReader(deps.doc, deps.ids);
  }

  public readBrief(): PageBrief {
    return readPageBrief(this.deps.doc, (element) => this.originalText(element));
  }

  public scan(): Block[] {
    const reads = this.reader.read(this.deps.doc);

    this.remember(reads);

    return reads.map((read) => read.block);
  }

  public watch(listener: SurfaceListener): () => void {
    this.watcher?.stop();

    const watcher = new BlockWatcher({
      root: this.deps.doc.body ?? this.deps.doc.documentElement,
      reader: this.reader,
      ports: this.deps.observers ?? browserWatcherPorts(this.deps.window),
      listener,
      onRead: (reads) => this.remember(reads),
      onDetached: (ids) => this.drop(ids),
    });

    this.watcher = watcher;
    watcher.start([...this.reads.values()]);

    return () => {
      watcher.stop();

      if (this.watcher === watcher) this.watcher = undefined;
    };
  }

  public commit(translation: BlockTranslation): Result<void, { code: "BLOCK_DETACHED" }> {
    const key = translation.blockId.value;
    const read = this.reads.get(key);

    if (!read?.scope[0]?.isConnected) {
      this.forget(key);

      return Result.fail({ code: "BLOCK_DETACHED" });
    }

    this.mutate(() => this.patch(key, read, translation));

    return Result.ok();
  }

  public show(view: SurfaceView): void {
    this.mutate(() => {
      for (const patch of this.patches.values()) {
        if (view === "original") restore(patch);
        else apply(patch.translated, patch.parked);
      }
    });
  }

  private patch(key: string, read: ReadBlock, translation: BlockTranslation): void {
    const previous = this.patches.get(key);

    if (previous) restore(previous);

    const original = this.originals.get(key) ?? snapshot(read);
    this.originals.set(key, original);

    for (const [text, value] of original.data) this.originalData.set(text, value);

    const patch = this.layout(read, translation, original);
    this.patches.set(key, patch);

    for (const extra of patch.extras) this.addedTexts.add(extra);
    apply(patch.translated, patch.parked);
  }

  private layout(read: ReadBlock, translation: BlockTranslation, original: Layout): Patch {
    const parked = new WeakSet<Node>();

    if (translation.kind === "text-slots") {
      return { original, translated: slotLayout(read, translation.texts), extras: [], parked };
    }

    if (read.commentAffixes.size > 0) {
      const texts = textSlots(translation.nodes);

      return { original, translated: slotLayout(read, texts), extras: [], parked };
    }

    const builder = new StructuredLayout(this.deps.doc, read, original, parked);
    const translated = builder.build(translation.nodes);

    return { original, translated, extras: builder.extras, parked };
  }

  private originalText(element: Element): string {
    const walker = this.deps.doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = "";

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (this.addedTexts.has(node)) continue;

      text += this.originalData.get(node) ?? node.nodeValue ?? "";
    }

    return text;
  }

  private remember(reads: ReadBlock[]): void {
    for (const read of reads) this.reads.set(read.block.id.value, read);
  }

  private drop(ids: BlockId[]): void {
    this.mutate(() => {
      for (const id of ids) {
        const patch = this.patches.get(id.value);

        if (patch) restore(patch);

        this.forget(id.value);
      }
    });
  }

  private forget(key: string): void {
    for (const text of this.originals.get(key)?.data.keys() ?? []) this.originalData.delete(text);

    this.reads.delete(key);
    this.originals.delete(key);
    this.patches.delete(key);
  }

  private mutate(change: () => void): void {
    if (this.watcher) {
      this.watcher.suppress(change);

      return;
    }

    change();
  }
}
