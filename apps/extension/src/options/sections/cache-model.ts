import { Option } from "@lambe/kernel/option";
import type { CacheSize } from "../../adapters/chrome/storage-translation-cache";

interface CachePort {
  size(): Promise<CacheSize>;
  clear(): Promise<void>;
}

const UNITS = [
  { unit: "gigabyte", bytes: 1e9 },
  { unit: "megabyte", bytes: 1e6 },
  { unit: "kilobyte", bytes: 1e3 },
] as const;

export function formatBytes(bytes: number, locale: string): string {
  const fitting = UNITS.find(({ bytes: size }) => bytes >= size);
  const unit = fitting?.unit ?? "byte";
  const value = bytes / (fitting?.bytes ?? 1);

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(count);
}

export function cacheModel(cache: CachePort) {
  const read = async (): Promise<Option<CacheSize>> => {
    try {
      return Option.some(await cache.size());
    } catch (cause) {
      console.warn("Lambë could not read the translation cache size.", cause);

      return Option.none();
    }
  };

  const clear = async (): Promise<Option<CacheSize>> => {
    try {
      await cache.clear();
    } catch (cause) {
      console.warn("Lambë could not clear the translation cache.", cause);
    }

    return read();
  };

  return { read, clear };
}
