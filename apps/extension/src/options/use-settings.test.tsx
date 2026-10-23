import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { defaultSettings } from "../settings/settings";
import { SETTINGS_KEY } from "../settings/settings-store";
import { renderWithSettings } from "./testing/render";
import { useSettings } from "./use-settings";

function TargetProbe() {
  const { loaded } = useSettings();

  return <output>{loaded.settings.target}</output>;
}

let cleanup = async (): Promise<void> => {};

afterEach(() => cleanup());

describe("useSettings", () => {
  test("reflects_changes_made_in_another_context", async () => {
    const rendered = await renderWithSettings(<TargetProbe />);
    cleanup = rendered.unmount;

    await act(async () => {
      rendered.storage.changeFromElsewhere({
        [SETTINGS_KEY]: { newValue: { ...defaultSettings("en"), target: "de" } },
      });
    });

    expect(rendered.container.querySelector("output")?.textContent).toBe("de");
  });
});
