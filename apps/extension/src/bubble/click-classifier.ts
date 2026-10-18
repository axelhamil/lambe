export interface Scheduler {
  set(cb: () => void, ms: number): number;
  clear(id: number): void;
}

export interface ClickHandlers {
  onSingle(): void;
  onDouble(): void;
}

export interface ClickClassifier {
  pointerUp(): void;
}

type Phase = "idle" | "single" | "double";

export function createClickClassifier(
  scheduler: Scheduler,
  handlers: ClickHandlers,
  windowMs = 250,
): ClickClassifier {
  let phase: Phase = "idle";

  return {
    pointerUp() {
      if (phase === "double") return;

      if (phase === "single") {
        phase = "double";
        handlers.onDouble();

        return;
      }

      phase = "single";
      scheduler.set(() => {
        phase = "idle";
      }, windowMs);
      handlers.onSingle();
    },
  };
}
