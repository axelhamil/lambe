import { describe, expect, test } from "bun:test";
import { BlockId } from "../block/value-objects/block-id.vo";
import { TranslationQueue } from "./translation-queue";

const id = (value: string): BlockId => BlockId.create(value).getValue();

const values = (ids: BlockId[]): string[] => ids.map((blockId) => blockId.value);

describe("TranslationQueue", () => {
  test("visible_before_next_screen_regardless_of_insertion_order", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("ahead-1"), 1, "content", 0);
    queue.enqueue(id("visible-1"), 0, "content", 1);
    queue.enqueue(id("ahead-2"), 1, "content", 2);
    queue.enqueue(id("visible-2"), 0, "content", 3);

    const taken = queue.take(4);

    expect(values(taken)).toEqual(["visible-1", "visible-2", "ahead-1", "ahead-2"]);
  });

  test("document_order_within_a_rank_regardless_of_insertion_order", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("c"), 0, "content", 2);
    queue.enqueue(id("a"), 0, "content", 0);
    queue.enqueue(id("b"), 0, "content", 1);

    const taken = queue.take(3);

    expect(values(taken)).toEqual(["a", "b", "c"]);
  });

  test("article_then_content_then_chrome_within_a_rank", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("navbar"), 0, "chrome", 0);
    queue.enqueue(id("sidebar"), 0, "chrome", 1);
    queue.enqueue(id("file-info"), 0, "content", 2);
    queue.enqueue(id("title"), 0, "article", 3);
    queue.enqueue(id("paragraph"), 0, "article", 4);

    const taken = queue.take(5);

    expect(values(taken)).toEqual(["title", "paragraph", "file-info", "navbar", "sidebar"]);
  });

  test("take_limited_to_visible_content_leaves_chrome_and_next_screen_queued", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("navbar"), 0, "chrome", 0);
    queue.enqueue(id("title"), 0, "article", 1);
    queue.enqueue(id("file-info"), 0, "content", 2);
    queue.enqueue(id("footer-text"), 1, "content", 3);

    const taken = queue.take(5, 0, "content");

    expect(values(taken)).toEqual(["title", "file-info"]);
    expect(values(queue.take(5))).toEqual(["navbar", "footer-text"]);
  });

  test("visible_chrome_before_off_screen_content", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("next-paragraph"), 1, "content", 2);
    queue.enqueue(id("footer"), 1, "chrome", 3);
    queue.enqueue(id("navbar"), 0, "chrome", 0);
    queue.enqueue(id("title"), 0, "content", 1);

    const taken = queue.take(4);

    expect(values(taken)).toEqual(["title", "navbar", "next-paragraph", "footer"]);
  });

  test("reenqueue_upgrades_but_never_downgrades", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("upgraded"), 1, "content", 1);
    queue.enqueue(id("visible"), 0, "content", 0);
    queue.enqueue(id("ahead"), 1, "content", 2);

    queue.enqueue(id("upgraded"), 0, "content", 1);
    queue.enqueue(id("visible"), 1, "content", 0);

    expect(values(queue.take(3))).toEqual(["visible", "upgraded", "ahead"]);
    expect(queue.size()).toBe(0);
  });

  test("drop_removes_and_ignores_absent", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("kept"), 0, "content", 0);
    queue.enqueue(id("far"), 1, "content", 1);

    queue.drop(id("far"));
    queue.drop(id("never-enqueued"));

    expect(values(queue.take(5))).toEqual(["kept"]);
  });

  test("take_removes_returned_ids", () => {
    const queue = new TranslationQueue();
    queue.enqueue(id("a"), 0, "content", 0);
    queue.enqueue(id("b"), 0, "content", 1);
    queue.enqueue(id("c"), 1, "content", 2);

    const first = queue.take(2);

    expect(values(first)).toEqual(["a", "b"]);
    expect(queue.size()).toBe(1);
    expect(values(queue.take(2))).toEqual(["c"]);
    expect(queue.take(2)).toEqual([]);
  });
});
