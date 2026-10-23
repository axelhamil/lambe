export interface OriginsFixStep {
  kind: "command" | "note";
  text: string;
}

export interface OriginsFix {
  os: "linux" | "macos" | "windows";
  origin: string;
  steps: OriginsFixStep[];
}

const command = (text: string): OriginsFixStep => ({ kind: "command", text });

const note = (text: string): OriginsFixStep => ({ kind: "note", text });

export function ollamaOriginsFix(extensionId: string): OriginsFix[] {
  const origin = `chrome-extension://${extensionId}`;

  return [
    {
      os: "linux",
      origin,
      steps: [
        command("sudo systemctl edit ollama"),
        note(`Add Environment="OLLAMA_ORIGINS=${origin}" under [Service], then save.`),
        command("sudo systemctl restart ollama"),
      ],
    },
    {
      os: "macos",
      origin,
      steps: [
        command(`launchctl setenv OLLAMA_ORIGINS "${origin}"`),
        note("Quit the Ollama app, then open it again."),
      ],
    },
    {
      os: "windows",
      origin,
      steps: [
        command(`setx OLLAMA_ORIGINS "${origin}"`),
        note("Quit Ollama from the tray, then start it again."),
      ],
    },
  ];
}
