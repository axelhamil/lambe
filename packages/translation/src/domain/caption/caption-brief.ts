export interface CaptionBrief {
  kind: "captions";
  host: string;
  url: string;
  title: string;
  channel: string;
  description: string;
  generated: boolean;
  preceding: string[];
}
