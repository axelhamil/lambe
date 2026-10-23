import { describe, expect, mock, test } from "bun:test";
import { defaultSettings } from "../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../settings/settings-store";
import { fakeStorageArea } from "../settings/testing/fake-storage-area";
import { createLogger, debugSetting } from "./logger";

function fakeSink() {
  return { debug: mock(), info: mock(), warn: mock(), error: mock() };
}

const withDebug = (debug: boolean) => ({ ...defaultSettings("en"), debug });

describe("logger", () => {
  test("debug_is_silent_by_default", () => {
    const sink = fakeSink();
    const logger = createLogger({ current: () => defaultSettings("en") }, sink);

    logger.debug("stats", { inFlight: 2 });
    logger.info("ready");

    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
  });

  test("debug_follows_the_setting_live", async () => {
    const storage = fakeStorageArea({ [SETTINGS_KEY]: withDebug(true) });
    const store = new SettingsStore(storage.area, "en");
    const sink = fakeSink();
    const logger = createLogger(debugSetting(store), sink);

    await store.load();
    logger.debug("first");
    storage.changeFromElsewhere({ [SETTINGS_KEY]: { newValue: withDebug(false) } });
    logger.debug("second");
    storage.changeFromElsewhere({ [SETTINGS_KEY]: { newValue: withDebug(true) } });
    logger.info("third");

    expect(sink.debug.mock.calls).toEqual([["first"]]);
    expect(sink.info.mock.calls).toEqual([["third"]]);
  });

  test("warnings_and_errors_always_log", () => {
    const sink = fakeSink();
    const logger = createLogger({ current: () => withDebug(false) }, sink);
    const cause = new Error("offline");

    logger.warn("could not sync", cause);
    logger.error("could not start", cause);

    expect(sink.warn.mock.calls).toEqual([["could not sync", cause]]);
    expect(sink.error.mock.calls).toEqual([["could not start", cause]]);
  });

  test("a_payload_with_an_api_key_field_is_redacted", () => {
    const sink = fakeSink();
    const logger = createLogger({ current: () => withDebug(true) }, sink);

    logger.debug("provider", { provider: { model: "gpt", apiKey: "sk-secret" } });
    logger.error("failed", [{ apiKey: "sk-secret" }]);

    expect(JSON.stringify([sink.debug.mock.calls, sink.error.mock.calls])).not.toContain(
      "sk-secret",
    );
    expect(sink.debug.mock.calls).toEqual([
      ["provider", { provider: { model: "gpt", apiKey: "[redacted]" } }],
    ]);
  });
});
