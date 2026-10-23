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

export function trackSignature(track: CaptionTrack): string {
  const textLength = track.units.reduce((total, unit) => total + unit.text.length, 0);

  return JSON.stringify([
    track.videoId.value,
    track.language.value,
    track.generated,
    track.units.length,
    track.units.at(-1)?.endMs ?? 0,
    textLength,
  ]);
}
