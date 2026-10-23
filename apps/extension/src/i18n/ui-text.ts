import { type RenderableError, renderError } from "./render-error";
import { type MessageKey, t } from "./t";

export interface UiText {
  translate(key: MessageKey): string;
  renderError(error: RenderableError): string;
}

export const catalogUiText: UiText = {
  translate: (key) => t(key),
  renderError: (error) => renderError(error),
};
