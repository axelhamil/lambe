import { chromeHostAccess } from "../../access/host-access";
import { t } from "../../i18n/t";
import { Card, CardContent } from "../components/ui/card";
import { SwitchField } from "../switch-field";
import { useGrantedOrigins } from "../use-granted-origins";
import { useSettings } from "../use-settings";
import { ChangeNotice, PermissionMissing, useChangeFeedback } from "./permission-feedback";
import { youtubeModel, youtubeState } from "./youtube-model";

export function YoutubeSection() {
  const { loaded, update } = useSettings();
  const granted = useGrantedOrigins();
  const { notice, follow } = useChangeFeedback();
  const model = youtubeModel({ access: chromeHostAccess, update });
  const state = youtubeState(loaded.settings, granted.unwrapOr([]));
  const missing = granted.isSome() && state.permissionMissing;

  return (
    <>
      <ChangeNotice notice={notice} />
      <Card>
        <CardContent>
          <SwitchField
            id="youtube-captions"
            label={t("options.youtube.enableLabel")}
            description={t("options.youtube.enableHint")}
            tip={t("options.youtube.enableTip")}
            checked={state.on}
            onCheckedChange={(on) =>
              follow(model.setEnabled(on), t(on ? "options.youtube.on" : "options.youtube.off"))
            }
          >
            {missing && <PermissionMissing onRegrant={() => follow(model.setEnabled(true))} />}
          </SwitchField>
        </CardContent>
      </Card>
    </>
  );
}
