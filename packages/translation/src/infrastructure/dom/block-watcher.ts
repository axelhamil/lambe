import { Option } from "@lambe/kernel/option";
import type { SurfaceListener } from "../../application/ports/page-surface";
import type { BlockId } from "../../domain/block/value-objects/block-id.vo";
import type { ProximityRank } from "../../domain/queue/translation-queue";
import type { BlockReader, ReadBlock } from "./block-reader";
import { isInHiddenSubtree } from "./protected-nodes";

export interface ProximityEntry {
  target: Element;
  isIntersecting: boolean;
}

export interface MutationPort {
  observe(target: Node, options: MutationObserverInit): void;
  takeRecords(): MutationRecord[];
  disconnect(): void;
}

export interface IntersectionPort {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

export interface WatcherPorts {
  mutations(callback: (records: MutationRecord[]) => void): MutationPort;
  intersections(
    callback: (entries: ProximityEntry[]) => void,
    options: { rootMargin: string },
  ): IntersectionPort;
  nextFrame(callback: () => void): void;
}

export function browserWatcherPorts(window: Window): WatcherPorts {
  return {
    mutations: (callback) => new MutationObserver(callback),
    intersections: (callback, options) => new IntersectionObserver(callback, options),
    nextFrame: (callback) => {
      window.requestAnimationFrame(callback);
    },
  };
}

interface Tracked {
  id: BlockId;
  head: Node;
  target: Element;
}

interface Sighting {
  near?: boolean;
  visible?: boolean;
}

interface BlockWatcherDeps {
  root: Node;
  reader: BlockReader;
  ports: WatcherPorts;
  listener: SurfaceListener;
  onRead: (reads: ReadBlock[]) => void;
  onDetached: (ids: BlockId[]) => void;
}

const REVEALING_ATTRIBUTES = ["class", "style", "hidden", "open", "aria-expanded"];

const MUTATION_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributeFilter: REVEALING_ATTRIBUTES,
};

const ONE_VIEWPORT_MARGIN = "100% 0px 100% 0px";

const NO_MARGIN = "0px";

function rankOf(near: boolean, visible: boolean): Option<ProximityRank> {
  if (visible) return Option.some(0);

  return near ? Option.some(1) : Option.none();
}

export class BlockWatcher {
  private readonly mutations: MutationPort;
  private readonly near: IntersectionPort;
  private readonly viewport: IntersectionPort;
  private readonly tracked = new Map<string, Tracked>();
  private targets = new WeakMap<Element, Set<string>>();
  private sightings = new WeakMap<Element, Sighting>();
  private readonly sighted = new Set<Element>();
  private sightingScheduled = false;
  private ranks = new WeakMap<Element, Option<ProximityRank>>();
  private readonly addedRoots = new Set<Node>();
  private removals = false;
  private scheduled = false;
  private suppressing = false;
  private stopped = false;

  public constructor(private readonly deps: BlockWatcherDeps) {
    this.mutations = deps.ports.mutations((records) => this.collect(records));
    this.near = deps.ports.intersections((entries) => this.report(entries, "near"), {
      rootMargin: ONE_VIEWPORT_MARGIN,
    });
    this.viewport = deps.ports.intersections((entries) => this.report(entries, "visible"), {
      rootMargin: NO_MARGIN,
    });
  }

  public start(initial: ReadBlock[]): void {
    this.mutations.observe(this.deps.root, MUTATION_OPTIONS);
    this.track(initial);
  }

  public stop(): void {
    this.stopped = true;
    this.mutations.disconnect();
    this.near.disconnect();
    this.viewport.disconnect();
    this.tracked.clear();
    this.targets = new WeakMap();
    this.sightings = new WeakMap();
    this.sighted.clear();
    this.ranks = new WeakMap();
    this.addedRoots.clear();
  }

  public suppress(patch: () => void): void {
    this.collect(this.mutations.takeRecords());
    this.suppressing = true;

    try {
      patch();
    } finally {
      this.mutations.takeRecords();
      this.suppressing = false;
    }
  }

  private collect(records: MutationRecord[]): void {
    if (this.suppressing || this.stopped) return;

    for (const record of records) {
      if (record.removedNodes.length > 0) this.removals = true;

      if (record.type === "attributes" && record.target instanceof Element)
        this.addedRoots.add(record.target);

      for (const node of record.addedNodes) {
        const root = node instanceof Element ? node : node.parentElement;

        if (root) this.addedRoots.add(root);
      }
    }

    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || (this.addedRoots.size === 0 && !this.removals)) return;

    this.scheduled = true;
    this.deps.ports.nextFrame(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;

    if (this.stopped) return;

    if (this.removals) this.dropDetached();

    const roots = [...this.addedRoots].filter(
      (root) => root.isConnected && !(root instanceof Element && isInHiddenSubtree(root)),
    );
    this.addedRoots.clear();

    const outermost = roots.filter(
      (root) => !roots.some((other) => other !== root && other.contains(root)),
    );
    const reads = outermost.flatMap((root) =>
      root instanceof Element ? this.deps.reader.read(root) : [],
    );

    if (reads.length === 0) return;

    this.deps.onRead(reads);
    this.deps.listener.onBlocks(reads.map((read) => read.block));
    this.track(reads);
  }

  private track(reads: ReadBlock[]): void {
    for (const read of reads) {
      const head = read.scope[0];
      const target = head instanceof Element ? head : head?.parentElement;

      if (!head || !target) {
        this.deps.listener.onProximity(read.block.id, Option.none());
        continue;
      }

      this.tracked.set(read.block.id.value, { id: read.block.id, head, target });
      this.target(read.block.id, target);
    }
  }

  private target(id: BlockId, target: Element): void {
    const ids = this.targets.get(target);

    if (!ids) {
      this.targets.set(target, new Set([id.value]));
      this.near.observe(target);
      this.viewport.observe(target);

      return;
    }

    ids.add(id.value);
    const rank = this.ranks.get(target);

    if (rank) this.deps.listener.onProximity(id, rank);
  }

  private dropDetached(): void {
    this.removals = false;

    const detached: BlockId[] = [];

    for (const [key, tracked] of this.tracked) {
      if (tracked.head.isConnected) continue;

      this.tracked.delete(key);
      this.untarget(tracked.target, key);
      detached.push(tracked.id);
      this.deps.listener.onProximity(tracked.id, Option.none());
    }

    if (detached.length > 0) this.deps.onDetached(detached);
  }

  private untarget(target: Element, key: string): void {
    const ids = this.targets.get(target);

    ids?.delete(key);

    if (ids && ids.size > 0) return;

    this.targets.delete(target);
    this.sightings.delete(target);
    this.sighted.delete(target);
    this.ranks.delete(target);
    this.near.unobserve(target);
    this.viewport.unobserve(target);
  }

  private report(entries: ProximityEntry[], zone: keyof Sighting): void {
    if (this.stopped) return;

    for (const entry of entries) {
      if (!this.targets.has(entry.target)) continue;

      const sighting = { ...this.sightings.get(entry.target), [zone]: entry.isIntersecting };

      this.sightings.set(entry.target, sighting);
      this.sighted.add(entry.target);
    }

    if (this.sightingScheduled || this.sighted.size === 0) return;

    this.sightingScheduled = true;
    this.deps.ports.nextFrame(() => this.rerank());
  }

  private rerank(): void {
    this.sightingScheduled = false;

    if (this.stopped) return;

    const sighted = [...this.sighted];
    this.sighted.clear();

    for (const target of sighted) {
      const ids = this.targets.get(target);
      const sighting = this.sightings.get(target);

      if (!ids || sighting?.near === undefined || sighting.visible === undefined) continue;

      const rank = rankOf(sighting.near, sighting.visible);
      const previous = this.ranks.get(target);

      this.ranks.set(target, rank);

      if (previous !== undefined && previous.toUndefined() === rank.toUndefined()) continue;

      for (const key of ids) {
        const tracked = this.tracked.get(key);

        if (tracked) this.deps.listener.onProximity(tracked.id, rank);
      }
    }
  }
}
