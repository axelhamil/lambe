import type { TranslationCache } from "@lambe/translation/application/ports/translation-cache";
import { z } from "zod";

export interface StorageAreaLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, string>): Promise<void>;
}

const KEY_PREFIX = "tc:";

const cachedMarkupSchema = z.string();

export class StorageTranslationCache implements TranslationCache {
  public constructor(private readonly area: StorageAreaLike) {}

  public async getMany(keys: string[]): Promise<Map<string, string>> {
    const hits = new Map<string, string>();

    if (keys.length === 0) return hits;

    try {
      const items = await this.area.get(keys.map((key) => KEY_PREFIX + key));

      for (const key of keys) {
        const markup = cachedMarkupSchema.safeParse(items[KEY_PREFIX + key]);

        if (markup.success) hits.set(key, markup.data);
      }

      return hits;
    } catch {
      return new Map();
    }
  }

  public async setMany(entries: Map<string, string>): Promise<void> {
    if (entries.size === 0) return;

    const items = Object.fromEntries(
      [...entries].map(([key, markup]) => [KEY_PREFIX + key, markup]),
    );

    try {
      await this.area.set(items);
    } catch {
      return;
    }
  }
}
