export type ProviderErrorCode =
  | "PROVIDER_UNREACHABLE"
  | "PROVIDER_FORBIDDEN_ORIGIN"
  | "PROVIDER_UNAUTHORIZED"
  | "PROVIDER_MODEL_MISSING"
  | "PROVIDER_BAD_RESPONSE"
  | "PROVIDER_TIMEOUT"
  | "REQUEST_CANCELLED"
  | "CONSENT_REQUIRED";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  params?: Record<string, string>;
}

export function providerError(
  code: ProviderErrorCode,
  message: string,
  params?: Record<string, string>,
): ProviderError {
  if (params === undefined) return { code, message };

  return { code, message, params };
}

export function requestCancelled(): ProviderError {
  return providerError("REQUEST_CANCELLED", "The translation request was cancelled.");
}
