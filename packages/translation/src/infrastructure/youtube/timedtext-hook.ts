import type { TimedtextCapture } from "./json3-track";

interface ObservedXhr extends EventTarget {
  readonly status: number;
  readonly responseText: string;
  readonly responseURL: string;
}

interface XhrPrototype {
  open(this: ObservedXhr, ...args: unknown[]): unknown;
  send(this: ObservedXhr, ...args: unknown[]): unknown;
}

type FetchInput = string | URL | { url: string };

export interface HookTarget {
  XMLHttpRequest: { prototype: XhrPrototype };
  fetch(input: FetchInput, ...rest: never[]): Promise<Response>;
}

type Emit = (capture: TimedtextCapture) => void;

const TIMEDTEXT_PATH = "/api/timedtext";

const OK = 200;

const installed = new WeakSet<HookTarget>();

function quietly(observe: () => void): void {
  try {
    observe();
  } catch {
    return;
  }
}

function timedtextUrl(url: unknown): string | undefined {
  if (typeof url !== "string" && !(url instanceof URL)) return undefined;

  const parsed = URL.parse(url, globalThis.location?.href);

  return parsed?.pathname.endsWith(TIMEDTEXT_PATH) ? parsed.href : undefined;
}

function inputUrl(input: FetchInput): string | URL {
  return typeof input === "string" || input instanceof URL ? input : input.url;
}

function hookXhr(prototype: XhrPrototype, emit: Emit): void {
  const open = prototype.open;
  const send = prototype.send;
  const opened = new WeakMap<ObservedXhr, string>();

  prototype.open = function (this: ObservedXhr, ...args: unknown[]): unknown {
    quietly(() => {
      const url = timedtextUrl(args[1]);

      if (url) opened.set(this, url);
    });

    return open.apply(this, args);
  };

  prototype.send = function (this: ObservedXhr, ...args: unknown[]): unknown {
    quietly(() => {
      const url = opened.get(this);

      if (!url) return;

      this.addEventListener(
        "load",
        () =>
          quietly(() => {
            if (this.status !== OK) return;

            emit({ url: this.responseURL || url, body: this.responseText });
          }),
        { once: true },
      );
    });

    return send.apply(this, args);
  };
}

function observeFetch(response: Response, url: string, emit: Emit): void {
  if (response.status !== OK) return;

  const source = response.url || url;

  response
    .clone()
    .text()
    .then(
      (body) => quietly(() => emit({ url: source, body })),
      () => undefined,
    );
}

function hookFetch(target: HookTarget, emit: Emit): void {
  const original = target.fetch;

  target.fetch = function (this: unknown, ...args: Parameters<HookTarget["fetch"]>) {
    const pending = original.apply(this, args);

    quietly(() => {
      const url = timedtextUrl(inputUrl(args[0]));

      if (!url) return;

      pending.then(
        (response) => quietly(() => observeFetch(response, url, emit)),
        () => undefined,
      );
    });

    return pending;
  };
}

export function installTimedtextHook(target: HookTarget, emit: Emit): void {
  if (installed.has(target)) return;

  installed.add(target);
  quietly(() => hookXhr(target.XMLHttpRequest.prototype, emit));
  quietly(() => hookFetch(target, emit));
}
