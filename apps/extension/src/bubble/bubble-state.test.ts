import { describe, expect, test } from "bun:test";
import { providerError } from "@lambe/translation/domain/provider/provider-error";
import { fakeUiText } from "../i18n/testing/fake-ui-text";
import { bubbleStateOf } from "./bubble-state";

describe("bubble state", () => {
  test("translating_is_busy", () => {
    const view = bubbleStateOf({ kind: "translating" }, fakeUiText);

    expect(view.classes).toEqual(["busy"]);
    expect(view.label).toBe("<bubble.translating>");
    expect(view.tooltip.isNone()).toBe(true);
  });

  test("translated_is_on_and_offers_the_original", () => {
    const view = bubbleStateOf({ kind: "translated" }, fakeUiText);

    expect(view.classes).toEqual(["on"]);
    expect(view.label).toBe("<bubble.original>");
    expect(view.tooltip.isNone()).toBe(true);
  });

  test("error_tooltip_renders_the_code_and_params_never_the_english_message", () => {
    const error = providerError("PROVIDER_UNREACHABLE", "Ollama is not running.", {
      baseUrl: "http://localhost:11434",
    });

    const view = bubbleStateOf({ kind: "error", error }, fakeUiText);

    expect(view.classes).toEqual(["unavailable"]);
    expect(view.label).toBe("<bubble.retry>");
    expect(view.tooltip.unwrap()).toBe(
      "<bubble.errorTitle>\nNo model server at http://localhost:11434.",
    );
  });

  test("a_failed_request_is_an_error_while_a_missing_server_or_model_is_unavailable", () => {
    const failed = providerError("PROVIDER_BAD_RESPONSE", "Bad response.");
    const missing = providerError("PROVIDER_MODEL_MISSING", "No model.", { model: "m" });

    expect(bubbleStateOf({ kind: "error", error: failed }, fakeUiText).classes).toEqual(["error"]);
    expect(bubbleStateOf({ kind: "error", error: missing }, fakeUiText).classes).toEqual([
      "unavailable",
    ]);
  });
});
