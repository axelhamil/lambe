import { describe, expect, mock, test } from "bun:test";
import { Result } from "@lambe/kernel/result";
import type { SegmentOutcome } from "@lambe/translation/application/batch-translation.service";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import { respondToTranslateBatch } from "./translate-batch.handler";

const payload = {
  segments: [{ id: "0", markup: "Hello" }],
  source: "en",
  target: "fr",
  brief: { host: "x.test", title: "", description: "", headings: [], sourceLanguage: null },
  cachePolicy: "use",
};

describe("respondToTranslateBatch", () => {
  test("answers_with_the_service_outcomes", async () => {
    const outcomes: SegmentOutcome[] = [
      { id: "0", status: "translated", markup: "Bonjour", fromCache: true },
    ];
    const translate = mock(
      async (): Promise<Result<SegmentOutcome[], ProviderError>> => Result.ok(outcomes),
    );

    const response = await respondToTranslateBatch(payload, { translate });

    expect(response).toEqual({ ok: true, outcomes });
  });

  test("invalid_payload_and_thrown_service_map_to_error_responses", async () => {
    const translate = mock(async () => Promise.reject(new Error("boom")));

    const invalid = await respondToTranslateBatch({ ...payload, target: "?" }, { translate });
    const thrown = await respondToTranslateBatch(payload, { translate });

    expect(invalid).toMatchObject({ ok: false, error: { code: "PROVIDER_BAD_RESPONSE" } });
    expect(thrown).toMatchObject({ ok: false, error: { code: "PROVIDER_UNREACHABLE" } });
  });
});
