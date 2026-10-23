export const cleanText = (text: string | null | undefined): string =>
  (text ?? "").replace(/\s+/g, " ").trim();
