import { BlockId } from "../block/value-objects/block-id.vo";
import type { VideoId } from "./value-objects/video-id.vo";

export interface CaptionSentence {
  id: BlockId;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  sound: boolean;
}

export function sentenceId(videoId: VideoId, index: number): BlockId {
  return BlockId.create(`${videoId.value}:${index}`).getValue();
}
