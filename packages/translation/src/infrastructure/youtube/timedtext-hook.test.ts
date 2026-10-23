import { describe, expect, test } from "bun:test";
import type { TimedtextCapture } from "./json3-track";
import { type HookTarget, installTimedtextHook } from "./timedtext-hook";

const TIMEDTEXT_URL = "https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3";
const OTHER_URL = "https://www.youtube.com/youtubei/v1/player";
const BODY = '{"events":[{"tStartMs":0,"segs":[{"utf8":"hello"}]}]}';

class FakeXhr extends EventTarget {
  public status = 0;
  public responseText = "";
  public responseURL = "";
  public opened: unknown[] = [];
  public sent: unknown[] = [];

  public open(...args: unknown[]): void {
    this.opened = args;
  }

  public send(...args: unknown[]): void {
    this.sent = args;
  }

  public respond(status: number, body: string): void {
    this.status = status;
    this.responseText = body;
    this.responseURL = String(this.opened[1]);
    this.dispatchEvent(new Event("load"));
  }
}

interface FakeWindow extends HookTarget {
  XMLHttpRequest: typeof FakeXhr;
  calls: unknown[][];
}

const fakeWindow = (respond: (input: unknown) => Promise<Response>): FakeWindow => {
  const calls: unknown[][] = [];

  class PageXhr extends FakeXhr {}

  return {
    XMLHttpRequest: PageXhr,
    calls,
    fetch: (...args: unknown[]) => {
      calls.push(args);

      return respond(args[0]);
    },
  };
};

const okResponse = (body: string, status = 200): Promise<Response> =>
  Promise.resolve(new Response(body, { status }));

const recorder = (): {
  captures: TimedtextCapture[];
  emit: (capture: TimedtextCapture) => void;
} => {
  const captures: TimedtextCapture[] = [];

  return { captures, emit: (capture) => captures.push(capture) };
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("installTimedtextHook", () => {
  test("xhr_timedtext_response_is_emitted_unchanged", () => {
    const target = fakeWindow(() => okResponse(""));
    const { captures, emit } = recorder();
    installTimedtextHook(target, emit);

    const xhr = new target.XMLHttpRequest();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    xhr.respond(200, BODY);

    expect(xhr.opened).toEqual(["GET", TIMEDTEXT_URL]);
    expect(xhr.sent).toEqual([]);
    expect(xhr.responseText).toBe(BODY);
    expect(captures).toEqual([{ url: TIMEDTEXT_URL, body: BODY }]);
  });

  test("fetch_timedtext_response_is_emitted_and_the_page_still_reads_the_body", async () => {
    const response = new Response(BODY, { status: 200 });
    const target = fakeWindow(() => Promise.resolve(response));
    const { captures, emit } = recorder();
    installTimedtextHook(target, emit);

    const seen = await target.fetch(TIMEDTEXT_URL);
    const pageBody = await seen.text();
    await settle();

    expect(seen).toBe(response);
    expect(pageBody).toBe(BODY);
    expect(target.calls).toEqual([[TIMEDTEXT_URL]]);
    expect(captures).toEqual([{ url: TIMEDTEXT_URL, body: BODY }]);
  });

  test("other_urls_and_non_200_are_ignored", async () => {
    const target = fakeWindow((input) => okResponse(BODY, input === TIMEDTEXT_URL ? 404 : 200));
    const { captures, emit } = recorder();
    installTimedtextHook(target, emit);

    const other = new target.XMLHttpRequest();
    other.open("GET", OTHER_URL);
    other.send();
    other.respond(200, BODY);

    const failed = new target.XMLHttpRequest();
    failed.open("GET", TIMEDTEXT_URL);
    failed.send();
    failed.respond(500, BODY);

    await target.fetch(OTHER_URL);
    await target.fetch(TIMEDTEXT_URL);
    await target.fetch(new URL("https://www.youtube.com/api/timedtextual"));
    await settle();

    expect(captures).toEqual([]);
  });

  test("observer_error_never_reaches_the_page", async () => {
    const failure = new Error("network down");
    let fails = false;
    const target = fakeWindow(() => (fails ? Promise.reject(failure) : okResponse(BODY)));
    installTimedtextHook(target, () => {
      throw new Error("observer bug");
    });
    const pageErrors: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      pageErrors.push(event.error);
    };
    globalThis.addEventListener("error", onError);

    const xhr = new target.XMLHttpRequest();
    let pageLoaded = false;
    xhr.addEventListener("load", () => {
      pageLoaded = true;
    });
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    xhr.respond(200, BODY);

    const response = await target.fetch(TIMEDTEXT_URL);
    const pageBody = await response.text();
    fails = true;
    const rejected = await target.fetch(TIMEDTEXT_URL).catch((error: unknown) => error);
    await settle();
    globalThis.removeEventListener("error", onError);

    expect(pageLoaded).toBe(true);
    expect(pageBody).toBe(BODY);
    expect(rejected).toBe(failure);
    expect(pageErrors).toEqual([]);
  });

  test("installing_twice_emits_once", async () => {
    const target = fakeWindow(() => okResponse(BODY));
    const { captures, emit } = recorder();
    installTimedtextHook(target, emit);
    installTimedtextHook(target, emit);

    const xhr = new target.XMLHttpRequest();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    xhr.respond(200, BODY);
    await target.fetch(TIMEDTEXT_URL);
    await settle();

    expect(captures).toHaveLength(2);
    expect(target.calls).toHaveLength(1);
  });
});
