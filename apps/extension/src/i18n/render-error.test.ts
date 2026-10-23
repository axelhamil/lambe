import { describe, expect, test } from "bun:test";
import { renderError } from "./render-error";

const CATALOG: Record<string, string> = {
  "error.PROVIDER_MODEL_MISSING": "Model {model} is missing at {baseUrl}. Pull it, then try again.",
  "error.UNKNOWN": "Something went wrong. Try again.",
};

function lookup(key: string): string {
  return CATALOG[key] ?? "";
}

describe("renderError", () => {
  test("fills_params_in_catalog_order", () => {
    const rendered = renderError(
      {
        code: "PROVIDER_MODEL_MISSING",
        params: { baseUrl: "http://localhost:11434", model: "translategemma:12b" },
      },
      lookup,
    );

    expect(rendered).toBe(
      "Model translategemma:12b is missing at http://localhost:11434. Pull it, then try again.",
    );
  });

  test("unknown_code_uses_the_generic_message", () => {
    const rendered = renderError({ code: "SOMETHING_NEW", params: { baseUrl: "x" } }, lookup);

    expect(rendered).toBe("Something went wrong. Try again.");
  });
});
