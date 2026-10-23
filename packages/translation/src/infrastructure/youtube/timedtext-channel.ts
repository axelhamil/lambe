import { z } from "zod";
import type { TimedtextCapture } from "./timedtext-hook";

export const TIMEDTEXT_EVENT = "lambe:timedtext";

export const READY_EVENT = "lambe:timedtext-ready";

export const MAX_BODY_CHARS = 5_000_000;

const REPLAYED_CAPTURES = 3;

const captureSchema = z.object({ url: z.url(), body: z.string() });

export interface TimedtextRelay {
  publish(capture: TimedtextCapture): void;
}

export function createTimedtextRelay(doc: Document): TimedtextRelay {
  const recent: string[] = [];
  const dispatch = (detail: string): void => {
    doc.dispatchEvent(new CustomEvent(TIMEDTEXT_EVENT, { detail }));
  };

  doc.addEventListener(READY_EVENT, () => {
    for (const detail of recent) dispatch(detail);
  });

  return {
    publish: (capture) => {
      const detail = JSON.stringify(capture);

      recent.push(detail);

      if (recent.length > REPLAYED_CAPTURES) recent.shift();

      dispatch(detail);
    },
  };
}

function parseDetail(detail: string): unknown {
  try {
    return JSON.parse(detail);
  } catch {
    return undefined;
  }
}

function captureOf(event: Event): TimedtextCapture | undefined {
  if (!(event instanceof CustomEvent)) return undefined;

  const detail: unknown = event.detail;

  if (typeof detail !== "string" || detail.length > MAX_BODY_CHARS) return undefined;

  const parsed = captureSchema.safeParse(parseDetail(detail));

  return parsed.success ? parsed.data : undefined;
}

export function listenTimedtext(
  doc: Document,
  onCapture: (capture: TimedtextCapture) => void,
): () => void {
  const handle = (event: Event): void => {
    const capture = captureOf(event);

    if (capture) onCapture(capture);
  };

  doc.addEventListener(TIMEDTEXT_EVENT, handle);
  doc.dispatchEvent(new CustomEvent(READY_EVENT));

  return () => doc.removeEventListener(TIMEDTEXT_EVENT, handle);
}
