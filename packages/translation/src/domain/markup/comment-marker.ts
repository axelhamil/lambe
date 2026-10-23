interface CommentParts {
  prefix: string;
  body: string;
  suffix: string;
}

const COMMENT_PATTERNS: RegExp[] = [
  /^(\s*#![\s\S]*)()()$/,
  /^(\s*\/\*+\s*)([\s\S]*?)(\s*\*+\/\s*)$/,
  /^(\s*<!--\s*)([\s\S]*?)(\s*-->\s*)$/,
  /^(\s*\*(?!\/)\s*)([\s\S]*?)(\s*(?:\*+\/)?\s*)$/,
  /^(\s*\/\*+\s*)([\s\S]*?)(\s*)$/,
  /^(\s*<!--\s*)([\s\S]*?)(\s*)$/,
  /^(\s*(?:\/\/+|#+|--(?!>)|;+)\s*)([\s\S]*?)(\s*)$/,
  /^(\s*)([\s\S]*?)(\s*\*+\/\s*)$/,
  /^(\s*)([\s\S]*?)(\s*-->\s*)$/,
  /^(\s*)([\s\S]*?)(\s*)$/,
];

export function splitCommentMarker(text: string): CommentParts {
  for (const pattern of COMMENT_PATTERNS) {
    const match = pattern.exec(text);

    if (match) return { prefix: match[1] ?? "", body: match[2] ?? "", suffix: match[3] ?? "" };
  }

  return { prefix: "", body: text, suffix: "" };
}
