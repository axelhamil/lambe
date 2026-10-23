import { z } from "zod";
import {
  providerSettingsSchema,
  SETTINGS_VERSION,
  type Settings,
  settingsSchema,
} from "./settings";

type Migration = (raw: unknown, defaults: Settings) => unknown;

const LEGACY_VERSION = 0;

const legacyEnvelopeSchema = z.object({ legacy: z.unknown() });

const legacyOverrideSchema = z.object({
  target: settingsSchema.shape.target.optional(),
  provider: providerSettingsSchema.partial().optional(),
});

const fromLegacyOverride: Migration = (raw, defaults) => {
  const envelope = legacyEnvelopeSchema.safeParse(raw);
  const override = legacyOverrideSchema.safeParse(envelope.data?.legacy);

  if (!override.success) return defaults;

  return {
    ...defaults,
    target: override.data.target ?? defaults.target,
    provider: { ...defaults.provider, ...override.data.provider },
  };
};

const MIGRATIONS: Record<number, Migration> = {
  [LEGACY_VERSION]: fromLegacyOverride,
};

export function legacyEnvelope(legacy: unknown): unknown {
  return { version: LEGACY_VERSION, legacy };
}

export function migrate(raw: unknown, fromVersion: number, defaults: Settings): unknown {
  let current = raw;

  for (let version = fromVersion; version < SETTINGS_VERSION; version += 1) {
    const migration = MIGRATIONS[version];

    if (migration === undefined) return current;

    current = migration(current, defaults);
  }

  return current;
}
