import { Option } from "@lambe/kernel/option";
import type { ViewState } from "@lambe/translation/application/page-translation.service";
import type { UiText } from "../i18n/ui-text";

export type BubbleClass = "on" | "busy" | "error" | "unavailable";

const UNAVAILABLE_CODES = new Set([
  "PROVIDER_UNREACHABLE",
  "PROVIDER_MODEL_MISSING",
  "PROVIDER_FORBIDDEN_ORIGIN",
]);

export interface BubbleState {
  classes: BubbleClass[];
  label: string;
  tooltip: Option<string>;
}

export function bubbleStateOf(state: ViewState, text: UiText): BubbleState {
  switch (state.kind) {
    case "original":
      return { classes: [], label: text.translate("bubble.translate"), tooltip: Option.none() };
    case "translating":
      return {
        classes: ["busy"],
        label: text.translate("bubble.translating"),
        tooltip: Option.none(),
      };
    case "translated":
      return { classes: ["on"], label: text.translate("bubble.original"), tooltip: Option.none() };
    case "error":
      return {
        classes: [UNAVAILABLE_CODES.has(state.error.code) ? "unavailable" : "error"],
        label: text.translate("bubble.retry"),
        tooltip: Option.some(
          `${text.translate("bubble.errorTitle")}\n${text.renderError(state.error)}`,
        ),
      };
  }
}
