import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type {
  BatchRequest,
  SegmentOutcome,
} from "@lambe/translation/application/batch-translation.service";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import { z } from "zod";

const TRANSLATE_BATCH_TYPE = "lambe/translate-batch";

const batchRequestDtoSchema = z.object({
  segments: z.array(z.object({ id: z.string(), markup: z.string() })),
  source: z.string().nullable(),
  target: z.string(),
  brief: z.object({
    host: z.string(),
    title: z.string(),
    description: z.string(),
    headings: z.array(z.string()),
    sourceLanguage: z.string().nullable(),
  }),
  cachePolicy: z.enum(["use", "refresh"]),
});

export type BatchRequestDto = z.infer<typeof batchRequestDtoSchema>;

export const translateBatchEnvelopeSchema = z.object({
  type: z.literal(TRANSLATE_BATCH_TYPE),
  payload: z.unknown(),
});

export const translateBatchRequestSchema = translateBatchEnvelopeSchema.extend({
  payload: batchRequestDtoSchema,
});

export type TranslateBatchRequest = z.infer<typeof translateBatchRequestSchema>;

const providerErrorSchema = z.object({
  code: z.enum([
    "PROVIDER_UNREACHABLE",
    "PROVIDER_FORBIDDEN_ORIGIN",
    "PROVIDER_MODEL_MISSING",
    "PROVIDER_BAD_RESPONSE",
    "PROVIDER_TIMEOUT",
  ]),
  message: z.string(),
}) satisfies z.ZodType<ProviderError>;

const segmentOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.string(),
    status: z.literal("translated"),
    markup: z.string(),
    fromCache: z.boolean(),
  }),
  z.object({
    id: z.string(),
    status: z.literal("failed"),
    code: z.enum([
      "MARKUP_MALFORMED",
      "PLACEHOLDER_LOST",
      "PLACEHOLDER_DUPLICATED",
      "STRUCTURE_MOVED",
      "SEGMENT_TOO_LONG",
      "RESPONSE_MISSING_SEGMENT",
    ]),
  }),
]) satisfies z.ZodType<SegmentOutcome>;

export const translateBatchResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), outcomes: z.array(segmentOutcomeSchema) }),
  z.object({ ok: z.literal(false), error: providerErrorSchema }),
]);

export type TranslateBatchResponse = z.infer<typeof translateBatchResponseSchema>;

function optionalCode(value: string | null): Result<Option<LanguageCode>, string> {
  if (value === null) return Result.ok(Option.none());

  return LanguageCode.create(value).map((code) => Option.some(code));
}

export function toBatchRequestDto(request: BatchRequest): BatchRequestDto {
  return {
    segments: request.segments.map(({ id, markup }) => ({ id, markup })),
    source: request.source.map((code) => code.value).toUndefined() ?? null,
    target: request.target.value,
    brief: {
      ...request.brief,
      headings: [...request.brief.headings],
      sourceLanguage: request.brief.sourceLanguage.map((code) => code.value).toUndefined() ?? null,
    },
    cachePolicy: request.cachePolicy,
  };
}

export function fromBatchRequestDto(dto: BatchRequestDto): Result<BatchRequest, string> {
  return optionalCode(dto.source).flatMap((source) =>
    LanguageCode.create(dto.target).flatMap((target) =>
      optionalCode(dto.brief.sourceLanguage).map((sourceLanguage) => ({
        segments: dto.segments,
        source,
        target,
        brief: { ...dto.brief, sourceLanguage },
        cachePolicy: dto.cachePolicy,
      })),
    ),
  );
}

export function translateBatchMessage(request: BatchRequest): TranslateBatchRequest {
  return { type: TRANSLATE_BATCH_TYPE, payload: toBatchRequestDto(request) };
}
