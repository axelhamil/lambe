import type { Result } from "@lambe/kernel/result";
import { renderError } from "../../i18n/render-error";
import type { Settings } from "../../settings/settings";
import type { SettingsProblem } from "../../settings/settings-store";

export type Saved = Result<void, SettingsProblem>;

export interface SettingsAccess {
  settings: Settings;
  update(change: (current: Settings) => Settings): Promise<Saved>;
}

export function problemNotice(problem: SettingsProblem): string {
  return renderError({ code: problem.code });
}
