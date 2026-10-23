import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type {
  BatchRequest,
  SegmentOutcome,
} from "@lambe/translation/application/batch-translation.service";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import type { ContentBrief } from "@lambe/translation/domain/prompt/prompt-adapter";
import type { ProviderError } from "@lambe/translation/domain/provider/provider-error";
import { z } from "zod";

export const TRANSLATE_PORT_NAME = "lambe/translate";

const batchRequestDtoSchema = z.object({
  segments: z.array(z.object({ id: z.string(), markup: z.string() })),
  source: z.string().nullable(),
  target: z.string(),
  brief: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("page"),
      host: z.string(),
      url: z.string(),
      title: z.string(),
      description: z.string(),
      headings: z.array(z.string()),
      sourceLanguage: z.string().nullable(),
    }),
    z.object({
      kind: z.literal("captions"),
      host: z.string(),
      url: z.string(),
      title: z.string(),
      channel: z.string(),
      description: z.string(),
      generated: z.boolean(),
      preceding: z.array(z.string()),
    }),
  ]),
  cachePolicy: z.enum(["use", "refresh"]),
});

export type BatchRequestDto = z.infer<typeof batchRequestDtoSchema>;

const requestIdSchema = z.string().min(1);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("translate"), requestId: requestIdSchema, payload: z.unknown() }),
  z.object({ type: z.literal("cancel"), requestId: requestIdSchema }),
]);

export const translateMessageSchema = z.object({
  type: z.literal("translate"),
  requestId: requestIdSchema,
  payload: batchRequestDtoSchema,
});

export type TranslateMessage = z.infer<typeof translateMessageSchema>;

export type CancelMessage = Extract<z.infer<typeof clientMessageSchema>, { type: "cancel" }>;

const providerErrorSchema = z.object({
  code: z.enum([
    "PROVIDER_UNREACHABLE",
    "PROVIDER_FORBIDDEN_ORIGIN",
    "PROVIDER_UNAUTHORIZED",
    "PROVIDER_MODEL_MISSING",
    "PROVIDER_BAD_RESPONSE",
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_TIMEOUT",
    "REQUEST_CANCELLED",
    "CONSENT_REQUIRED",
  ]),
  message: z.string(),
  params: z.record(z.string(), z.string()).optional(),
}) satisfies z.ZodType<ProviderError>;

const segmentOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.string(),
    status: z.literal("translated"),
    markup: z.string(),
    fromCache: z.boolean(),
    lostGroups: z.int().positive().optional(),
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
      "TRANSLATION_EMPTY",
    ]),
  }),
]) satisfies z.ZodType<SegmentOutcome>;

export const translateBatchResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), outcomes: z.array(segmentOutcomeSchema) }),
  z.object({ ok: z.literal(false), error: providerErrorSchema }),
]);

export type TranslateBatchResponse = z.infer<typeof translateBatchResponseSchema>;

const concurrencySchema = z.int().positive();

export const workerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("outcome"),
    requestId: requestIdSchema,
    outcome: segmentOutcomeSchema,
  }),
  z.object({
    type: z.literal("done"),
    requestId: requestIdSchema,
    response: translateBatchResponseSchema,
    concurrency: concurrencySchema.optional(),
  }),
  z.object({ type: z.literal("capacity"), concurrency: concurrencySchema }),
]);

export type WorkerMessage = z.infer<typeof workerMessageSchema>;

export const addressedMessageSchema = z.object({ requestId: requestIdSchema });

function optionalCode(value: string | null): Result<Option<LanguageCode>, string> {
  if (value === null) return Result.ok(Option.none());

  return LanguageCode.create(value).map((code) => Option.some(code));
}

type BriefDto = BatchRequestDto["brief"];

function toBriefDto(brief: ContentBrief): BriefDto {
  if (brief.kind === "captions") return { ...brief, preceding: [...brief.preceding] };

  return {
    ...brief,
    headings: [...brief.headings],
    sourceLanguage: brief.sourceLanguage.map((code) => code.value).toUndefined() ?? null,
  };
}

function fromBriefDto(dto: BriefDto): Result<ContentBrief, string> {
  if (dto.kind === "captions") return Result.ok(dto);

  return optionalCode(dto.sourceLanguage).map((sourceLanguage) => ({ ...dto, sourceLanguage }));
}

export function toBatchRequestDto(request: BatchRequest): BatchRequestDto {
  return {
    segments: request.segments.map(({ id, markup }) => ({ id, markup })),
    source: request.source.map((code) => code.value).toUndefined() ?? null,
    target: request.target.value,
    brief: toBriefDto(request.brief),
    cachePolicy: request.cachePolicy,
  };
}

export function fromBatchRequestDto(dto: BatchRequestDto): Result<BatchRequest, string> {
  return optionalCode(dto.source).flatMap((source) =>
    LanguageCode.create(dto.target).flatMap((target) =>
      fromBriefDto(dto.brief).map((brief) => ({
        segments: dto.segments,
        source,
        target,
        brief,
        cachePolicy: dto.cachePolicy,
      })),
    ),
  );
}

export function translateMessage(requestId: string, request: BatchRequest): TranslateMessage {
  return { type: "translate", requestId, payload: toBatchRequestDto(request) };
}
