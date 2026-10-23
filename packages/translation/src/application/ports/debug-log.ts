export interface DebugLog {
  debug(message: string, ...details: unknown[]): void;
}
