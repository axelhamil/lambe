import { describe, expect, test } from "bun:test";
import {
  createTimedtextRelay,
  listenTimedtext,
  MAX_BODY_CHARS,
  TIMEDTEXT_EVENT,
} from "./timedtext-channel";
import type { TimedtextCapture } from "./timedtext-hook";

const capture = (n: number): TimedtextCapture => ({
  url: `https://www.youtube.com/api/timedtext?v=abc&lang=en&n=${n}`,
  body: `{"events":[],"n":${n}}`,
});

const freshDocument = (): Document => document.implementation.createHTMLDocument("t");

describe("timedtext channel", () => {
  test("capture_published_before_the_listener_is_replayed_on_ready", () => {
    const doc = freshDocument();
    const relay = createTimedtextRelay(doc);
    relay.publish(capture(1));

    const received: TimedtextCapture[] = [];
    listenTimedtext(doc, (value) => received.push(value));
    relay.publish(capture(2));

    expect(received).toEqual([capture(1), capture(2)]);
  });

  test("forged_or_oversized_detail_is_ignored", () => {
    const doc = freshDocument();
    const received: TimedtextCapture[] = [];
    listenTimedtext(doc, (value) => received.push(value));
    const forge = (detail: unknown): void => {
      doc.dispatchEvent(new CustomEvent(TIMEDTEXT_EVENT, { detail }));
    };

    forge(capture(1));
    forge("not json");
    forge(JSON.stringify({ url: "not a url", body: "{}" }));
    forge(JSON.stringify({ url: capture(1).url }));
    forge(JSON.stringify({ url: capture(1).url, body: "x".repeat(MAX_BODY_CHARS) }));
    doc.dispatchEvent(new Event(TIMEDTEXT_EVENT));

    expect(received).toEqual([]);
  });

  test("relay_keeps_only_the_last_three", () => {
    const doc = freshDocument();
    const relay = createTimedtextRelay(doc);
    for (const n of [1, 2, 3, 4]) relay.publish(capture(n));

    const received: TimedtextCapture[] = [];
    const stop = listenTimedtext(doc, (value) => received.push(value));
    stop();
    relay.publish(capture(5));

    expect(received).toEqual([capture(2), capture(3), capture(4)]);
  });
});
