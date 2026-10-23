const GUIDELINES_ID_LENGTH = 12;

const JARGON_RULE =
  "Leave terms of art in their original form when professionals of the page's field use them that way in the target language, for example fork, pull request, merge, commit, branch and deploy in software.";

export const TONE_RULE = "Keep the tone, register and formatting of the source.";

export const DEFAULT_GUIDELINES = `${JARGON_RULE} ${TONE_RULE}`;

interface GuidelinesHasher {
  sha256Hex(input: string): Promise<string>;
}

export function guidelinesTextOf(guidelines: string): string {
  return guidelines === "" ? DEFAULT_GUIDELINES : guidelines;
}

export async function guidelinesIdOf(text: string, hash: GuidelinesHasher): Promise<string> {
  if (guidelinesTextOf(text) === DEFAULT_GUIDELINES) return "";

  const digest = await hash.sha256Hex(text);

  return digest.slice(0, GUIDELINES_ID_LENGTH);
}
