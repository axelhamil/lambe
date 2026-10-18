export type ProviderErrorCode =
  | "PROVIDER_UNREACHABLE"
  | "PROVIDER_FORBIDDEN_ORIGIN"
  | "PROVIDER_MODEL_MISSING"
  | "PROVIDER_BAD_RESPONSE"
  | "PROVIDER_TIMEOUT";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
}

export function providerError(code: ProviderErrorCode, message: string): ProviderError {
  return { code, message };
}
