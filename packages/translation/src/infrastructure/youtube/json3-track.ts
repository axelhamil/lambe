import { Result } from "@lambe/kernel/result";
import { z } from "zod";
import type { CaptionTrack, TimedText } from "../../domain/caption/caption-track";
import { VideoId } from "../../domain/caption/value-objects/video-id.vo";
import { LanguageCode } from "../../domain/language/value-objects/language-code.vo";

export interface TimedtextCapture {
  url: string;
  body: string;
}

export type TimedtextErrorCode =
  | "TIMEDTEXT_NOT_JSON3"
  | "TIMEDTEXT_MALFORMED"
  | "TIMEDTEXT_NO_VIDEO"
  | "TIMEDTEXT_NO_LANGUAGE"
  | "TIMEDTEXT_EMPTY";

interface TimedtextError {
  code: TimedtextErrorCode;
  detail: string;
}

const YOUTUBE_ORIGIN = "https://www.youtube.com";

const json3Schema = z.object({
  events: z.array(
    z.object({
      tStartMs: z.number(),
      dDurationMs: z.number().optional(),
      aAppend: z.number().optional(),
      segs: z.array(z.object({ utf8: z.string(), tOffsetMs: z.number().optional() })).optional(),
    }),
  ),
});

type Json3Event = z.infer<typeof json3Schema>["events"][number];

const timedtextError = (code: TimedtextErrorCode, detail: string): TimedtextError => ({
  code,
  detail,
});

function jsonOf(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

const eventEndOf = (event: Json3Event): number => event.tStartMs + (event.dDurationMs ?? 0);

function wordUnitsOf(events: Json3Event[]): TimedText[] {
  const words = events.flatMap((event) =>
    (event.segs ?? [])
      .map((seg) => ({
        text: seg.utf8.trim(),
        startMs: event.tStartMs + (seg.tOffsetMs ?? 0),
        eventEndMs: eventEndOf(event),
      }))
      .filter((word) => word.text.length > 0),
  );

  return words.map(({ text, startMs, eventEndMs }, index) => {
    const nextStartMs = words[index + 1]?.startMs ?? eventEndMs;

    return { text, startMs, endMs: Math.max(startMs, nextStartMs) };
  });
}

function cueUnitsOf(events: Json3Event[]): TimedText[] {
  return events
    .map((event) => ({
      text: (event.segs ?? [])
        .map((seg) => seg.utf8)
        .join("")
        .replace(/\s*\n\s*/g, " ")
        .trim(),
      startMs: event.tStartMs,
      endMs: eventEndOf(event),
    }))
    .filter((cue) => cue.text.length > 0);
}

export function parseTimedtext(capture: TimedtextCapture): Result<CaptionTrack, TimedtextError> {
  if (!URL.canParse(capture.url, YOUTUBE_ORIGIN))
    return Result.fail(timedtextError("TIMEDTEXT_MALFORMED", "The capture URL does not parse."));

  const params = new URL(capture.url, YOUTUBE_ORIGIN).searchParams;
  const format = params.get("fmt");

  if (format !== "json3")
    return Result.fail(
      timedtextError("TIMEDTEXT_NOT_JSON3", `Expected fmt=json3, got ${format ?? "none"}.`),
    );

  const videoId = VideoId.create(params.get("v") ?? "");

  if (videoId.isFailure)
    return Result.fail(timedtextError("TIMEDTEXT_NO_VIDEO", videoId.getError()));

  const translatedTo = params.get("tlang");
  const language = LanguageCode.create(translatedTo ?? params.get("lang") ?? "");

  if (language.isFailure)
    return Result.fail(timedtextError("TIMEDTEXT_NO_LANGUAGE", language.getError()));

  const parsed = json3Schema.safeParse(jsonOf(capture.body));

  if (!parsed.success)
    return Result.fail(
      timedtextError("TIMEDTEXT_MALFORMED", "The body is not a json3 caption document."),
    );

  const generated = params.get("kind") === "asr" && translatedTo === null;
  const units = generated ? wordUnitsOf(parsed.data.events) : cueUnitsOf(parsed.data.events);

  if (units.length === 0)
    return Result.fail(timedtextError("TIMEDTEXT_EMPTY", "The track holds no caption text."));

  return Result.ok({
    videoId: videoId.getValue(),
    language: language.getValue(),
    generated,
    units,
  });
}
