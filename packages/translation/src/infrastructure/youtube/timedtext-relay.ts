import type { TimedtextCapture } from "./json3-track";

export const TIMEDTEXT_EVENT = "lambe:timedtext";

export const READY_EVENT = "lambe:timedtext-ready";

const REPLAYED_CAPTURES = 3;

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
