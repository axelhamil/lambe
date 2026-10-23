import { describe, expect, test } from "bun:test";
import { providerError } from "@lambe/translation/domain/provider/provider-error";
import { OllamaProvider } from "@lambe/translation/infrastructure/providers/ollama-provider";
import { bubbleStateOf } from "./bubble-state";

const ORIGIN = "chrome-extension://abcdefghijklmnop";

async function forbiddenOriginError() {
  const provider = new OllamaProvider({
    baseUrl: "http://localhost:11434",
    model: "translategemma:12b",
    fetch: async () => new Response("", { status: 403 }),
    timeoutMs: 1000,
    forbiddenHint: ORIGIN,
  });
  const result = await provider.chat([{ role: "user", content: "Hello" }], {
    contextTokens: 2048,
  });

  return result.getError();
}

describe("bubble state", () => {
  test("translating_is_busy", () => {
    const view = bubbleStateOf({ kind: "translating" });

    expect(view.classes).toEqual(["busy"]);
    expect(view.tooltip.isNone()).toBe(true);
  });

  test("translated_is_on", () => {
    const view = bubbleStateOf({ kind: "translated" });

    expect(view.classes).toEqual(["on"]);
    expect(view.tooltip.isNone()).toBe(true);
  });

  test("error_has_tooltip_with_code_message", () => {
    const error = providerError("PROVIDER_UNREACHABLE", "Ollama is not running.");

    const view = bubbleStateOf({ kind: "error", error });

    expect(view.classes).toEqual(["error"]);
    expect(view.tooltip.unwrap()).toContain("PROVIDER_UNREACHABLE");
    expect(view.tooltip.unwrap()).toContain("Ollama is not running.");
  });

  test("forbidden_tooltip_contains_OLLAMA_ORIGINS_and_systemctl_edit_ollama", async () => {
    const error = await forbiddenOriginError();

    const tooltip = bubbleStateOf({ kind: "error", error }).tooltip.unwrap();

    expect(tooltip).toContain(`OLLAMA_ORIGINS=${ORIGIN}`);
    expect(tooltip).toContain("systemctl edit ollama");
  });
});
