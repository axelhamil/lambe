import type { CaptionError } from "../domain/caption/caption-error";
import type { ProviderError } from "../domain/provider/provider-error";

export type ViewState =
  | { kind: "original" }
  | { kind: "translating" }
  | { kind: "translated" }
  | { kind: "error"; error: ProviderError | CaptionError };

type StateListener = (state: ViewState) => void;

export class ViewStateStore {
  private view: ViewState = { kind: "original" };
  private readonly listeners = new Set<StateListener>();

  public current(): ViewState {
    return this.view;
  }

  public isShowingTranslation(): boolean {
    return this.view.kind === "translating" || this.view.kind === "translated";
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public set(state: ViewState): void {
    this.view = state;

    for (const listener of this.listeners) listener(state);
  }
}
