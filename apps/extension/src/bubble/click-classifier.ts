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

export function createClickClassifier(
  scheduler: Scheduler,
  handlers: ClickHandlers,
  windowMs = 250,
): ClickClassifier {
  let pending: number | undefined;

  return {
    pointerUp() {
      if (pending !== undefined) {
        scheduler.clear(pending);
        pending = undefined;
        handlers.onDouble();

        return;
      }

      pending = scheduler.set(() => {
        pending = undefined;
        handlers.onSingle();
      }, windowMs);
    },
  };
}
