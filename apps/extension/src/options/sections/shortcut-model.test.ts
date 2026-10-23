import { describe, expect, test } from "bun:test";
import { shortcutModel } from "./shortcut-model";

const commandsWith = (shortcut: string | undefined) => ({
  getAll: async () => [
    { name: "_execute_action", shortcut: "Ctrl+Shift+Y" },
    { name: "toggle-translation", shortcut },
  ],
});

const tabs = { create: async () => ({}) };

describe("shortcut settings", () => {
  test("reads_the_binding_of_the_toggle_command", async () => {
    const model = shortcutModel({ commands: commandsWith("Alt+L"), tabs });

    expect(await model.current()).toBe("Alt+L");
  });

  test("unset_binding_reads_as_empty", async () => {
    expect(await shortcutModel({ commands: commandsWith(""), tabs }).current()).toBe("");
    expect(await shortcutModel({ commands: commandsWith(undefined), tabs }).current()).toBe("");
  });
});
