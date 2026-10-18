import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import type { BatchRequest } from "@lambe/translation/application/batch-translation.service";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import {
  fromBatchRequestDto,
  toBatchRequestDto,
  translateBatchRequestSchema,
  translateBatchResponseSchema,
} from "./translate-batch.contract";

const code = (value: string): LanguageCode => LanguageCode.create(value).getValue();

const request: BatchRequest = {
  segments: [{ id: "0", markup: "Fork a <g1>repo</g1>" }],
  source: Option.some(code("en")),
  target: code("pt-BR"),
  brief: {
    host: "docs.github.com",
    title: "Fork a repo",
    description: "",
    headings: ["Forking"],
    sourceLanguage: Option.none(),
  },
  cachePolicy: "refresh",
};

describe("translate batch contract", () => {
  test("request_dto_roundtrips_language_codes_and_policy", () => {
    const message = JSON.parse(
      JSON.stringify({ type: "lambe/translate-batch", payload: toBatchRequestDto(request) }),
    );
    const parsed = translateBatchRequestSchema.parse(message);
    const restored = fromBatchRequestDto(parsed.payload).getValue();

    expect(restored.source.unwrap().value).toBe("en");
    expect(restored.target.value).toBe("pt-BR");
    expect(restored.brief.sourceLanguage.isNone()).toBe(true);
    expect(restored.brief.headings).toEqual(["Forking"]);
    expect(restored.cachePolicy).toBe("refresh");
    expect(restored.segments).toEqual(request.segments);
  });

  test("rejects_unknown_message_type", () => {
    const parsed = translateBatchRequestSchema.safeParse({
      type: "lambe/unknown",
      payload: toBatchRequestDto(request),
    });

    expect(parsed.success).toBe(false);
  });

  test("error_response_keeps_code_and_message", () => {
    const error: ProviderError = {
      code: "PROVIDER_FORBIDDEN_ORIGIN",
      message: "Set OLLAMA_ORIGINS.",
    };
    const parsed = translateBatchResponseSchema.parse(
      JSON.parse(JSON.stringify({ ok: false, error })),
    );

    expect(parsed).toEqual({ ok: false, error });
  });
});
