import { describe, expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { Option } from "@lambe/kernel/option";
import type { Block } from "../../domain/block/block";
import { textSlots } from "../../domain/block/block-translation";
import { BlockId } from "../../domain/block/value-objects/block-id.vo";
import type { ProximityRank } from "../../domain/queue/translation-queue";
import type { IntersectionPort, ProximityEntry, WatcherPorts } from "./block-watcher";
import { DomPageSurface } from "./dom-page-surface";

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

class FakeIntersections implements IntersectionPort {
  public readonly observed = new Set<Element>();
  public readonly pending: Element[] = [];

  public constructor(
    public readonly emit: (entries: ProximityEntry[]) => void,
    public readonly rootMargin: string,
  ) {}

  public observe(target: Element): void {
    if (this.observed.has(target)) return;

    this.observed.add(target);
    this.pending.push(target);
  }

  public deliverInitial(layout: (target: Element) => ProximityEntry): void {
    this.emit(this.pending.splice(0).map(layout));
  }

  public unobserve(target: Element): void {
    this.observed.delete(target);
  }

  public disconnect(): void {
    this.observed.clear();
  }
}

interface Harness {
  ports: WatcherPorts;
  frames: ReturnType<typeof mock<(callback: () => void) => void>>;
  near: () => FakeIntersections | undefined;
  viewport: () => FakeIntersections | undefined;
}

const NEAR_MARGIN = "100% 0px 100% 0px";
const VIEWPORT_MARGIN = "0px";

const harness = (realMutations: boolean): Harness => {
  const observers = new Map<string, FakeIntersections>();
  const frames = mock((callback: () => void) => {
    setTimeout(callback, 0);
  });

  return {
    frames,
    near: () => observers.get(NEAR_MARGIN),
    viewport: () => observers.get(VIEWPORT_MARGIN),
    ports: {
      mutations: (callback) =>
        realMutations
          ? new MutationObserver(callback)
          : { observe: () => {}, takeRecords: () => [], disconnect: () => {} },
      intersections: (callback, options) => {
        const observer = new FakeIntersections(callback, options.rootMargin);
        observers.set(options.rootMargin, observer);

        return observer;
      },
      nextFrame: frames,
    },
  };
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

const listener = () => ({
  onBlocks: mock((_blocks: Block[]) => {}),
  onProximity: mock((_id: BlockId, _rank: Option<ProximityRank>) => {}),
});

const rankLabel = (rank: Option<ProximityRank>): string =>
  rank.isSome() ? `${rank.unwrap()}` : "none";

const callFunction = (scope: Scope, name: string, ...args: unknown[]): void => {
  const fn = scope[name];

  if (typeof fn === "function") fn(...args);
};

const textOf = (block: Block): string => textSlots(block.nodes).join("").trim();

const entry = (target: Element, isIntersecting: boolean): ProximityEntry => ({
  target,
  isIntersecting,
});

describe("BlockWatcher through DomPageSurface.watch", () => {
  test("watcher_reports_blocks_added_after_start", async () => {
    const { doc, scope } = await loadFixture("spa-feed.html");
    const { ports } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    const initial = surface.scan();
    const stop = surface.watch(events);

    callFunction(scope, "__append", 3);
    await settle();
    const reported = events.onBlocks.mock.calls.flatMap(([blocks]) => blocks);
    callFunction(scope, "__trim");
    await settle();
    const dropped = events.onProximity.mock.calls
      .filter(([, rank]) => rank.isNone())
      .map(([id]) => id.value);
    stop();

    expect(initial.length).toBe(0);
    expect(events.onBlocks.mock.calls.length).toBe(1);
    expect(reported.map(textOf).join("|")).toBe(
      [1, 2, 3].flatMap((n) => [`Release ${n}`, "Run  to upgrade to this release."]).join("|"),
    );
    expect(dropped.join(",")).toBe(
      reported
        .slice(0, 2)
        .map((block) => block.id.value)
        .join(","),
    );
  });

  test("surface_own_mutations_do_not_retrigger_scanning", async () => {
    const { doc } = await loadFixture("github-fork-a-repo.html");
    const { ports, frames } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    const blocks = surface.scan().slice(0, 10);
    const stop = surface.watch(events);

    for (const block of blocks) {
      surface.commit({
        blockId: block.id,
        kind: "structured",
        nodes: [...block.nodes].reverse().concat([{ kind: "text", text: " extra" }]),
      });
    }
    surface.show("original");
    surface.show("translated");
    await settle();
    stop();

    expect(blocks.length).toBe(10);
    expect(events.onBlocks.mock.calls.length).toBe(0);
    expect(frames.mock.calls.length).toBe(0);
  });

  test("proximity_rank_zero_for_visible_one_for_margin_none_when_far", async () => {
    const doc = new DOMParser().parseFromString(
      "<!doctype html><html><body><p>Visible text</p><p>Next screen</p><p>Far below</p>Loose text</body></html>",
      "text/html",
    );
    const { ports, near, viewport } = harness(false);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    const blocks = surface.scan();
    surface.watch(events);
    const [visible, margin, far] = [...doc.querySelectorAll("p")];

    if (visible && margin && far) {
      near()?.emit([
        entry(visible, true),
        entry(margin, true),
        entry(far, false),
        entry(doc.body, false),
      ]);
      await Promise.resolve();
      viewport()?.emit([
        entry(visible, true),
        entry(margin, false),
        entry(far, false),
        entry(doc.body, false),
      ]);
    }
    await settle();
    const reports = events.onProximity.mock.calls.map(
      ([id, rank]) => `${id.value}:${rankLabel(rank)}`,
    );

    expect(blocks.length).toBe(4);
    expect(near()?.observed.size).toBe(4);
    expect(viewport()?.observed.size).toBe(4);
    expect(reports.join(",")).toBe("b1:0,b2:1,b3:none,b4:none");
  });

  test("unsubscribe_disconnects_both_observers", async () => {
    const { doc, scope } = await loadFixture("spa-feed.html");
    const { ports, near, viewport } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    surface.scan();
    const stop = surface.watch(events);

    callFunction(scope, "__append", 1);
    await settle();
    const observedBefore = [near()?.observed.size, viewport()?.observed.size];
    stop();
    callFunction(scope, "__append", 1);
    await settle();

    expect(observedBefore).toEqual([2, 2]);
    expect(near()?.observed.size).toBe(0);
    expect(viewport()?.observed.size).toBe(0);
    expect(events.onBlocks.mock.calls.length).toBe(1);
  });

  test("block_added_later_on_an_already_observed_target_gets_the_cached_rank", async () => {
    const doc = new DOMParser().parseFromString(
      "<!doctype html><html><body>Loose one<p>Para text</p></body></html>",
      "text/html",
    );
    const { ports, near, viewport } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    surface.scan();
    const stop = surface.watch(events);
    near()?.deliverInitial((target) => entry(target, true));
    viewport()?.deliverInitial((target) => entry(target, true));

    doc.body.append("Loose two");
    await settle();
    const added = events.onBlocks.mock.calls.flatMap(([blocks]) => blocks);
    const reports = events.onProximity.mock.calls.map(
      ([id, rank]) => `${id.value}:${rankLabel(rank)}`,
    );
    stop();

    expect(added.map(textOf).join("|")).toBe("Loose two");
    expect(near()?.pending.length).toBe(0);
    expect(viewport()?.pending.length).toBe(0);
    expect(reports.join(",")).toBe("b1:0,b2:0,b3:0");
  });

  test("jump_from_far_to_visible_reports_rank_zero_without_passing_through_near", async () => {
    const doc = new DOMParser().parseFromString(
      "<!doctype html><html><body><p>Anchor target</p></body></html>",
      "text/html",
    );
    const { ports, near, viewport } = harness(false);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    surface.scan();
    surface.watch(events);
    const paragraph = doc.querySelector("p");

    if (paragraph) {
      near()?.emit([entry(paragraph, false)]);
      viewport()?.emit([entry(paragraph, false)]);
      await settle();
      near()?.emit([entry(paragraph, true)]);
      viewport()?.emit([entry(paragraph, true)]);
    }
    await settle();
    const reports = events.onProximity.mock.calls.map(([, rank]) => rankLabel(rank));

    expect(reports.join(",")).toBe("none,0");
  });

  test("rank_follows_scrolling_into_and_out_of_the_viewport", async () => {
    const doc = new DOMParser().parseFromString(
      "<!doctype html><html><body><p>On screen</p><p>Below the fold</p></body></html>",
      "text/html",
    );
    const { ports, near, viewport } = harness(false);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    surface.scan();
    surface.watch(events);
    const [onScreen, below] = [...doc.querySelectorAll("p")];

    if (onScreen && below) {
      near()?.emit([entry(onScreen, true), entry(below, true)]);
      viewport()?.emit([entry(onScreen, true), entry(below, false)]);
      await settle();
      events.onProximity.mockClear();
      viewport()?.emit([entry(onScreen, false), entry(below, true)]);
    }
    await settle();
    const reports = events.onProximity.mock.calls.map(
      ([id, rank]) => `${id.value}:${rankLabel(rank)}`,
    );

    expect(reports.join(",")).toBe("b1:1,b2:0");
  });

  test("detached_blocks_are_forgotten_by_the_surface", async () => {
    const { doc, scope } = await loadFixture("spa-feed.html");
    const { ports, near } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    surface.scan();
    const stop = surface.watch(events);

    callFunction(scope, "__append", 1);
    await settle();
    const [heading] = events.onBlocks.mock.calls.flatMap(([blocks]) => blocks);
    const article = doc.querySelector("article");
    callFunction(scope, "__trim");
    await settle();
    const observedAfterTrim = near()?.observed.size;
    if (article) doc.querySelector("main")?.append(article);
    await settle();
    const result =
      heading && surface.commit({ blockId: heading.id, kind: "text-slots", texts: ["Version"] });
    stop();

    expect(observedAfterTrim).toBe(0);
    expect(result?.isFailure).toBe(true);
    expect(doc.querySelector("h2")?.textContent).toBe("Release 1");
  });

  test("detached_then_reattached_block_shows_its_original_text", async () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><body><main><section id="s"><p>Hello world</p></section></main></body></html>',
      "text/html",
    );
    const { ports } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const [block] = surface.scan();
    const stop = surface.watch(listener());
    const section = doc.getElementById("s");

    if (block) surface.commit({ blockId: block.id, kind: "text-slots", texts: ["Bonjour monde"] });
    section?.remove();
    await settle();
    if (section) doc.querySelector("main")?.append(section);
    await settle();
    surface.show("original");
    stop();

    expect(doc.querySelector("p")?.textContent).toBe("Hello world");
  });

  test("replaced_head_text_restores_the_rest_of_the_run", async () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><body><div id="c">Hello <a>link</a> world</div></body></html>',
      "text/html",
    );
    const { ports } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const [block] = surface.scan();
    const stop = surface.watch(listener());
    const container = doc.getElementById("c");

    if (block) {
      surface.commit({
        blockId: block.id,
        kind: "text-slots",
        texts: ["Bonjour ", "lien", " monde"],
      });
    }
    const head = container?.firstChild;
    if (head) container?.replaceChild(doc.createTextNode("Hi "), head);
    await settle();
    surface.show("original");
    stop();

    expect(container?.innerHTML).toBe("Hi <a>link</a> world");
  });
});

describe("BlockWatcher on content revealed later", () => {
  const watchedPage = (body: string) => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><head><style>.collapsed{display:none}</style></head><body>${body}</body></html>`,
      "text/html",
    );
    const { ports, near, viewport } = harness(true);
    const surface = new DomPageSurface({ doc, window, ids: idSource(), observers: ports });
    const events = listener();
    const initial = surface.scan().map(textOf);
    const stop = surface.watch(events);
    const reported = (): string[] =>
      events.onBlocks.mock.calls.flatMap(([blocks]) => blocks).map(textOf);
    const ranks = (): string[] =>
      events.onProximity.mock.calls.map(([id, rank]) => `${id.value}:${rankLabel(rank)}`);

    return { doc, initial, stop, reported, ranks, near, viewport };
  };

  test("hidden_section_is_read_at_scan_and_ranked_once_it_becomes_visible", async () => {
    const { doc, initial, stop, reported, ranks, near, viewport } = watchedPage(
      '<main><p>Lead paragraph</p><section id="more" class="collapsed"><p>Early life</p></section></main>',
    );
    const hidden = doc.querySelector("#more p");

    near()?.deliverInitial((target) => entry(target, target !== hidden));
    viewport()?.deliverInitial((target) => entry(target, target !== hidden));
    await settle();
    doc.getElementById("more")?.classList.remove("collapsed");
    if (hidden) {
      near()?.emit([entry(hidden, true)]);
      viewport()?.emit([entry(hidden, true)]);
    }
    await settle();
    stop();

    expect(initial).toEqual(["Lead paragraph", "Early life"]);
    expect(reported()).toEqual([]);
    expect(ranks()).toEqual(["b1:0", "b2:none", "b2:0"]);
  });

  test("attribute_changes_on_links_and_footnotes_create_no_block", async () => {
    const { doc, initial, stop, reported } = watchedPage(
      '<main><p>See <a href="https://example.com/docs">https://example.com/docs</a> for details.</p><p>Notes<sup class="reference">[note a]</sup> here.</p></main>',
    );

    doc.querySelector("a")?.setAttribute("href", "https://example.com/other");
    doc.querySelector("a")?.setAttribute("class", "visited");
    doc.querySelector("sup")?.setAttribute("class", "reference highlighted");
    await settle();
    stop();

    expect(initial).toEqual(["See  for details.", "Notes here."]);
    expect(reported()).toEqual([]);
  });

  test("text_added_into_a_hidden_root_is_read_and_waits_to_be_shown", async () => {
    const { doc, stop, reported } = watchedPage(
      '<main><div id="menu" class="collapsed"></div></main>',
    );

    doc.getElementById("menu")?.append(doc.createTextNode("Appearance settings"));
    await settle();
    stop();

    expect(reported()).toEqual(["Appearance settings"]);
  });
});
