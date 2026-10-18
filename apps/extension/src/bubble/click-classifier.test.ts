import { describe, expect, mock, test } from "bun:test";
import { createClickClassifier } from "./click-classifier";

function manualScheduler() {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; cb: () => void }>();

  return {
    set(cb: () => void, ms: number): number {
      nextId += 1;
      timers.set(nextId, { at: now + ms, cb });

      return nextId;
    },
    clear(id: number): void {
      timers.delete(id);
    },
    advance(ms: number): void {
      now += ms;

      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;

        timers.delete(id);
        timer.cb();
      }
    },
  };
}

function setup() {
  const scheduler = manualScheduler();
  const handlers = { onSingle: mock(() => {}), onDouble: mock(() => {}) };
  const classifier = createClickClassifier(scheduler, handlers);

  return { scheduler, handlers, classifier };
}

describe("click classifier", () => {
  test("single_click_fires_after_250ms", () => {
    const { scheduler, handlers, classifier } = setup();

    classifier.pointerUp();
    scheduler.advance(249);

    expect(handlers.onSingle).not.toHaveBeenCalled();

    scheduler.advance(1);

    expect(handlers.onSingle).toHaveBeenCalledTimes(1);
    expect(handlers.onDouble).not.toHaveBeenCalled();
  });

  test("two_clicks_within_250ms_fire_only_double", () => {
    const { scheduler, handlers, classifier } = setup();

    classifier.pointerUp();
    scheduler.advance(120);
    classifier.pointerUp();
    scheduler.advance(1000);

    expect(handlers.onDouble).toHaveBeenCalledTimes(1);
    expect(handlers.onSingle).not.toHaveBeenCalled();
  });

  test("two_clicks_far_apart_fire_two_singles", () => {
    const { scheduler, handlers, classifier } = setup();

    classifier.pointerUp();
    scheduler.advance(400);
    classifier.pointerUp();
    scheduler.advance(400);

    expect(handlers.onSingle).toHaveBeenCalledTimes(2);
    expect(handlers.onDouble).not.toHaveBeenCalled();
  });
});
