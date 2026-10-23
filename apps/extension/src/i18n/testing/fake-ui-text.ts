import { renderError } from "../render-error";
import type { UiText } from "../ui-text";

const ERRORS: Record<string, string> = {
  "error.PROVIDER_UNREACHABLE": "No model server at {baseUrl}.",
  "error.UNKNOWN": "Unknown failure.",
};

export const fakeUiText: UiText = {
  translate: (key) => `<${key}>`,
  renderError: (error) => renderError(error, (key) => ERRORS[key] ?? ""),
};
