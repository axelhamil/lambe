import { chromeHostAccess } from "../../access/host-access";
import { t } from "../../i18n/t";
import { Switch } from "../components/ui/switch";
import { SettingRow } from "../setting-row";
import { useGrantedOrigins } from "../use-granted-origins";
import { useSettings } from "../use-settings";
import { ChangeNotice, PermissionMissing, useChangeFeedback } from "./permission-feedback";
import { youtubeModel, youtubeState } from "./youtube-model";

const ID = "youtube-captions";

export function YoutubeSection() {
  const { loaded, update } = useSettings();
  const granted = useGrantedOrigins();
  const { notice, follow } = useChangeFeedback();
  const model = youtubeModel({ access: chromeHostAccess, update });
  const state = youtubeState(loaded.settings, granted.unwrapOr([]));
  const missing = granted.isSome() && state.permissionMissing;

  return (
    <>
      <div className="settings-panel">
        <SettingRow
          id={ID}
          label={t("options.youtube.enableLabel")}
          hint={t("options.youtube.enableHint")}
          control={
            <Switch
              id={ID}
              aria-describedby={`${ID}-hint`}
              checked={state.on}
              onCheckedChange={(on) => follow(model.setEnabled(on))}
            />
          }
        >
          {missing && <PermissionMissing onRegrant={() => follow(model.setEnabled(true))} />}
        </SettingRow>
      </div>
      <ChangeNotice notice={notice} />
    </>
  );
}
