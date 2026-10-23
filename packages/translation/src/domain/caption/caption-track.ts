import type { LanguageCode } from "../language/value-objects/language-code.vo";
import type { VideoId } from "./value-objects/video-id.vo";

export interface TimedText {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionTrack {
  videoId: VideoId;
  language: LanguageCode;
  generated: boolean;
  units: TimedText[];
}

const FNV_OFFSET = 0x811c9dc5;

const FNV_PRIME = 0x01000193;

function fnv1a(text: string): string {
  let hash = FNV_OFFSET;

  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function contentOf(units: TimedText[]): string {
  return units
    .map(({ text, startMs, endMs }) => `${startMs}\u001f${endMs}\u001f${text}`)
    .join("\u001e");
}

export function trackSignature(track: CaptionTrack): string {
  return JSON.stringify([
    track.videoId.value,
    track.language.value,
    track.generated,
    track.units.length,
    fnv1a(contentOf(track.units)),
  ]);
}
