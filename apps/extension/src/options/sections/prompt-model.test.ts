import { describe, expect, test } from "bun:test";
import { DEFAULT_GUIDELINES } from "@lambe/translation/domain/prompt/guidelines";
import { PROMPT_VERSION } from "@lambe/translation/domain/prompt/prompt-version";
import { sha256Hasher } from "@lambe/translation/infrastructure/hashing/sha256-hasher";
import { SETTINGS_KEY, SettingsStore } from "../../settings/settings-store";
import { fakeStorageArea } from "../../settings/testing/fake-storage-area";
import { promptModel } from "./prompt-model";

const CUSTOM = "Keep it short and plain.";

const setup = () => {
  const storage = fakeStorageArea();
  const store = new SettingsStore(storage.area, "en");
  const model = async () =>
    promptModel({
      settings: (await store.load()).settings,
      update: (change) => store.update(change),
      hasher: sha256Hasher,
    });

  return { storage, model };
};

describe("prompt settings", () => {
  test("shows_the_default_text_until_customized", async () => {
    const { model } = setup();
    const initial = await model();

    expect(initial.text()).toBe(DEFAULT_GUIDELINES);
    expect(initial.isCustom()).toBe(false);

    await initial.save(CUSTOM);
    const customized = await model();

    expect(customized.text()).toBe(CUSTOM);
    expect(customized.isCustom()).toBe(true);
  });

  test("save_changes_the_guidelines_id", async () => {
    const { model } = setup();
    const before = await (await model()).version();

    await (await model()).save(CUSTOM);
    const after = await (await model()).version();

    expect(before).toEqual({ prompt: PROMPT_VERSION, guidelinesId: "" });
    expect(after.prompt).toBe(PROMPT_VERSION);
    expect(after.guidelinesId).toMatch(/^[0-9a-f]{12}$/);
  });

  test("reset_restores_the_default_and_clears_the_id", async () => {
    const { model } = setup();

    await (await model()).save(CUSTOM);
    await (await model()).reset();
    const restored = await model();

    expect(restored.text()).toBe(DEFAULT_GUIDELINES);
    expect(restored.isCustom()).toBe(false);
    expect((await restored.version()).guidelinesId).toBe("");
  });

  test("identical_to_default_is_stored_as_empty", async () => {
    const { storage, model } = setup();

    await (await model()).save(`  ${DEFAULT_GUIDELINES}\n`);

    expect(storage.stored(SETTINGS_KEY)).toMatchObject({ prompt: "" });
    expect((await model()).isCustom()).toBe(false);
  });
});
