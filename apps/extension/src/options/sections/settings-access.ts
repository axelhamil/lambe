import type { Result } from "@lambe/kernel/result";
import type { Settings } from "../../settings/settings";
import type { SettingsProblem } from "../../settings/settings-store";

export type Saved = Result<void, SettingsProblem>;

export interface SettingsAccess {
  settings: Settings;
  update(change: (current: Settings) => Settings): Promise<Saved>;
}
