const DOCS_URL = "https://github.com/axelhamil/lambe/blob/main/docs";

export const PRIVACY_POLICY_URL = `${DOCS_URL}/privacy-policy.md`;

export function localModelGuideUrl(uiLanguage: string): string {
  const file = uiLanguage.toLowerCase().startsWith("fr") ? "local-ai.fr.md" : "local-ai.md";

  return `${DOCS_URL}/${file}`;
}
