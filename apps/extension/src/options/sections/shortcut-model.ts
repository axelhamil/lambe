const TOGGLE_COMMAND = "toggle-translation";

const SHORTCUTS_PAGE = "chrome://extensions/shortcuts";

interface Command {
  name?: string;
  shortcut?: string;
}

interface ShortcutModelDeps {
  commands: { getAll(): Promise<Command[]> };
  tabs: { create(properties: { url: string }): Promise<unknown> };
}

export function shortcutKeys(shortcut: string): string[] {
  return shortcut.split("+").filter((key) => key !== "");
}

export function shortcutModel({ commands, tabs }: ShortcutModelDeps) {
  return {
    current: async (): Promise<string> => {
      const all = await commands.getAll();

      return all.find((command) => command.name === TOGGLE_COMMAND)?.shortcut ?? "";
    },
    openShortcutSettings: async (): Promise<void> => {
      await tabs.create({ url: SHORTCUTS_PAGE });
    },
  };
}
