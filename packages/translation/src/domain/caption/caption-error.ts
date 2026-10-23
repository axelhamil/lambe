export interface CaptionError {
  code: "NO_CAPTIONS";
  message: string;
}

export function noCaptions(): CaptionError {
  return { code: "NO_CAPTIONS", message: "This video has no captions to translate." };
}
