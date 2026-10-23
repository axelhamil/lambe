export interface FramePlacement {
  isTop: boolean;
  allFrames: boolean;
}

export function hostsBubble(frame: FramePlacement): boolean {
  return frame.isTop || frame.allFrames;
}
