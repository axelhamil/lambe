import { Option } from "@lambe/kernel/option";

export type FixNote = "linuxEdit" | "macosRestart" | "windowsRestart";

export type FixStep =
  | { kind: "command"; text: string }
  | { kind: "note"; note: FixNote; line: Option<string> };

export interface FixGuide {
  os: "linux" | "macos" | "windows";
  steps: FixStep[];
}

const command = (text: string): FixStep => ({ kind: "command", text });

const note = (fix: FixNote, line = Option.none<string>()): FixStep => ({
  kind: "note",
  note: fix,
  line,
});

export function ollamaOriginsFix(origin: string): FixGuide[] {
  return [
    {
      os: "linux",
      steps: [
        command("sudo systemctl edit ollama"),
        note("linuxEdit", Option.some(`Environment="OLLAMA_ORIGINS=${origin}"`)),
        command("sudo systemctl restart ollama"),
      ],
    },
    {
      os: "macos",
      steps: [command(`launchctl setenv OLLAMA_ORIGINS "${origin}"`), note("macosRestart")],
    },
    {
      os: "windows",
      steps: [command(`setx OLLAMA_ORIGINS "${origin}"`), note("windowsRestart")],
    },
  ];
}
