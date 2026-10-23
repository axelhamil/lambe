import { z } from "zod";
import type { TimedtextCapture } from "./json3-track";
import { READY_EVENT, TIMEDTEXT_EVENT } from "./timedtext-relay";

export const MAX_BODY_CHARS = 5_000_000;

const captureSchema = z.object({ url: z.url(), body: z.string() });

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
