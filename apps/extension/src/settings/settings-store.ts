import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { z } from "zod";
import { legacyEnvelope, migrate } from "./migrations";
import { defaultSettings, SETTINGS_VERSION, type Settings, settingsSchema } from "./settings";

export const SETTINGS_KEY = "lambe:settings";

const LEGACY_KEY = "lambe:config";

export type StorageChanges = Record<string, { newValue?: unknown }>;

type ChangesListener = (changes: StorageChanges) => void;

export interface SettingsArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  onChanged: {
    addListener(listener: ChangesListener): void;
    removeListener(listener: ChangesListener): void;
  };
}

export interface SettingsProblem {
  code: "SETTINGS_INVALID" | "SETTINGS_FROM_NEWER_VERSION";
  issues: string[];
}

export interface LoadedSettings {
  settings: Settings;
  problem: Option<SettingsProblem>;
}

interface Resolved {
  loaded: LoadedSettings;
  migrated: boolean;
}

const versionSchema = z.object({ version: z.int().nonnegative() });

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map(String).join(".") || "settings"}: ${issue.message}`,
  );
}

function invalid(error: z.ZodError): SettingsProblem {
  return { code: "SETTINGS_INVALID", issues: issuesOf(error) };
}

export class SettingsStore {
  private readonly defaults: Settings;

  public constructor(
    private readonly area: SettingsArea,
    uiLanguage: string,
  ) {
    this.defaults = defaultSettings(uiLanguage);
  }

  public async load(): Promise<LoadedSettings> {
    const items = await this.read();
    const stored = items[SETTINGS_KEY];
    const legacy = items[LEGACY_KEY];

    if (stored === undefined && legacy === undefined) return this.clean(this.defaults);

    const resolved = this.resolve(stored ?? legacyEnvelope(legacy));

    if (resolved.migrated && resolved.loaded.problem.isNone()) {
      await this.persistMigration(resolved.loaded.settings);
    }

    return resolved.loaded;
  }

  public async save(next: Settings): Promise<Result<void, SettingsProblem>> {
    const parsed = settingsSchema.safeParse(next);

    if (!parsed.success) return Result.fail(invalid(parsed.error));

    await this.area.set({ [SETTINGS_KEY]: parsed.data });

    return Result.ok();
  }

  public async update(
    change: (current: Settings) => Settings,
  ): Promise<Result<void, SettingsProblem>> {
    const { settings, problem } = await this.load();

    if (problem.isSome()) return Result.fail(problem.unwrap());

    return this.save(change(settings));
  }

  public subscribe(listener: (loaded: LoadedSettings) => void): () => void {
    const onChanged: ChangesListener = (changes) => {
      if (!Object.hasOwn(changes, SETTINGS_KEY)) return;

      const raw = changes[SETTINGS_KEY]?.newValue;

      listener(raw === undefined ? this.clean(this.defaults) : this.resolve(raw).loaded);
    };

    this.area.onChanged.addListener(onChanged);

    return () => this.area.onChanged.removeListener(onChanged);
  }

  private async read(): Promise<Record<string, unknown>> {
    try {
      return await this.area.get([SETTINGS_KEY, LEGACY_KEY]);
    } catch {
      return {};
    }
  }

  private async persistMigration(settings: Settings): Promise<void> {
    try {
      await this.area.set({ [SETTINGS_KEY]: settings });
    } catch (cause) {
      console.warn("Lambë could not store the migrated settings.", cause);
    }
  }

  private resolve(raw: unknown): Resolved {
    const version = versionSchema.safeParse(raw);

    if (!version.success) return this.withProblem(invalid(version.error));

    const from = version.data.version;

    if (from > SETTINGS_VERSION) {
      return this.withProblem({
        code: "SETTINGS_FROM_NEWER_VERSION",
        issues: [`version: ${from} is newer than ${SETTINGS_VERSION}`],
      });
    }

    const parsed = settingsSchema.safeParse(migrate(raw, from, this.defaults));

    if (!parsed.success) return this.withProblem(invalid(parsed.error));

    return { loaded: this.clean(parsed.data), migrated: from < SETTINGS_VERSION };
  }

  private withProblem(problem: SettingsProblem): Resolved {
    return { loaded: { settings: this.defaults, problem: Option.some(problem) }, migrated: false };
  }

  private clean(settings: Settings): LoadedSettings {
    return { settings, problem: Option.none() };
  }
}
