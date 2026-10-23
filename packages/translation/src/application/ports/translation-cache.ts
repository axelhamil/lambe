export interface TranslationCache {
  getMany(keys: string[]): Promise<Map<string, string>>;
  setMany(entries: Map<string, string>): Promise<void>;
}
