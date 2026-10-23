export function languageName(code: string, locales: string[]): string {
  try {
    return new Intl.DisplayNames(locales, { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
