import { YOUTUBE_MATCHES } from "../../permissions";
import type { Settings } from "../../settings/settings";
import {
  type Change,
  grantThenSave,
  type SettingsAccess,
  saveThenRelease,
  type ToggleState,
  toggleState,
} from "./permission-change";

export function youtubeState(settings: Settings, granted: string[]): ToggleState {
  return toggleState(settings.youtube, granted, YOUTUBE_MATCHES);
}

export function youtubeModel(deps: SettingsAccess) {
  const setEnabled = (on: boolean): Promise<Change> => {
    if (on) {
      return grantThenSave(deps, YOUTUBE_MATCHES, (current) => ({ ...current, youtube: true }));
    }

    return saveThenRelease(deps, (current) => ({ ...current, youtube: false }), YOUTUBE_MATCHES);
  };

  return { setEnabled };
}
