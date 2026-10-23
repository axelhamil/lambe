import { catalogMessage } from "./t";

export interface RenderableError {
  code: string;
  params?: Record<string, string>;
}

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

export function renderError(
  error: RenderableError,
  lookup: (key: string) => string = catalogMessage,
): string {
  const template = lookup(`error.${error.code}`);

  if (template === "") return lookup("error.UNKNOWN");

  const params = error.params ?? {};

  return template.replace(PLACEHOLDER, (placeholder, name: string) => params[name] ?? placeholder);
}
