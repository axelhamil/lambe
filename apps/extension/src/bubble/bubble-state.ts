import { Option } from "@lambe/kernel/option";
import type { ViewState } from "@lambe/translation/application/page-translation.service";

export type BubbleClass = "on" | "busy" | "error";

export interface BubbleState {
  classes: BubbleClass[];
  tooltip: Option<string>;
}

export function bubbleStateOf(state: ViewState): BubbleState {
  switch (state.kind) {
    case "original":
      return { classes: [], tooltip: Option.none() };
    case "translating":
      return { classes: ["busy"], tooltip: Option.none() };
    case "translated":
      return { classes: ["on"], tooltip: Option.none() };
    case "error":
      return {
        classes: ["error"],
        tooltip: Option.some(`${state.error.code}: ${state.error.message}`),
      };
  }
}
