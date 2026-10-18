import { describe, expect, mock, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import type {
  BatchRequest,
  SegmentOutcome,
} from "@lambe/translation/application/batch-translation.service";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import { RuntimeBatchTranslator } from "./runtime-batch-translator";

const request: BatchRequest = {
  segments: [{ id: "0", markup: "Hello" }],
  source: Option.none(),
  target: LanguageCode.create("fr").getValue(),
  brief: {
    host: "x.test",
    title: "",
    description: "",
    headings: [],
    sourceLanguage: Option.none(),
  },
  cachePolicy: "use",
};

describe("RuntimeBatchTranslator", () => {
  test("returns_outcomes_on_ok_response", async () => {
    const outcomes: SegmentOutcome[] = [
      { id: "0", status: "translated", markup: "Bonjour", fromCache: false },
      { id: "1", status: "failed", code: "PLACEHOLDER_LOST" },
    ];
    const send = mock(async (_message: unknown): Promise<unknown> => ({ ok: true, outcomes }));

    const result = await new RuntimeBatchTranslator(send).translate(request);

    expect(result.getValue()).toEqual(outcomes);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: "lambe/translate-batch",
      payload: { target: "fr", source: null, cachePolicy: "use" },
    });
  });

  test("maps_error_response_to_failure", async () => {
    const error: ProviderError = {
      code: "PROVIDER_TIMEOUT",
      message: "Ollama did not answer within 10 ms.",
    };
    const send = mock(async (): Promise<unknown> => ({ ok: false, error }));

    const result = await new RuntimeBatchTranslator(send).translate(request);

    expect(result.getError()).toEqual(error);
  });

  test("maps_malformed_response_to_PROVIDER_BAD_RESPONSE", async () => {
    const malformed = await new RuntimeBatchTranslator(
      mock(async (): Promise<unknown> => undefined),
    ).translate(request);
    const rejected = await new RuntimeBatchTranslator(
      mock(
        async (): Promise<unknown> => Promise.reject(new Error("Extension context invalidated.")),
      ),
    ).translate(request);

    expect(malformed.getError().code).toBe("PROVIDER_BAD_RESPONSE");
    expect(rejected.getError().code).toBe("PROVIDER_UNREACHABLE");
  });
});
