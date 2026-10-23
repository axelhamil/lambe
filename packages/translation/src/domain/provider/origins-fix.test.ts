import { describe, expect, test } from "bun:test";
import { type OriginsFix, ollamaOriginsFix } from "./origins-fix";

const ID = "abcdefghijklmnop";
const ORIGIN = `chrome-extension://${ID}`;

const fixFor = (os: OriginsFix["os"]): OriginsFix | undefined =>
  ollamaOriginsFix(ID).find((fix) => fix.os === os);

const commandsOf = (fix: OriginsFix | undefined): string[] =>
  (fix?.steps ?? []).filter((step) => step.kind === "command").map((step) => step.text);

describe("ollamaOriginsFix", () => {
  test("linux_fix_names_systemd_and_the_exact_origin", () => {
    const fix = fixFor("linux");
    const texts = (fix?.steps ?? []).map((step) => step.text);

    expect(fix?.origin).toBe(ORIGIN);
    expect(commandsOf(fix)).toEqual([
      "sudo systemctl edit ollama",
      "sudo systemctl restart ollama",
    ]);
    expect(texts.some((text) => text.includes(`Environment="OLLAMA_ORIGINS=${ORIGIN}"`))).toBe(
      true,
    );
    expect(texts.some((text) => text.includes("[Service]"))).toBe(true);
  });

  test("macos_fix_uses_launchctl_setenv", () => {
    const fix = fixFor("macos");

    expect(fix?.origin).toBe(ORIGIN);
    expect(commandsOf(fix)).toEqual([`launchctl setenv OLLAMA_ORIGINS "${ORIGIN}"`]);
    expect(fix?.steps.at(-1)?.kind).toBe("note");
  });

  test("windows_fix_uses_setx", () => {
    const fix = fixFor("windows");

    expect(fix?.origin).toBe(ORIGIN);
    expect(commandsOf(fix)).toEqual([`setx OLLAMA_ORIGINS "${ORIGIN}"`]);
    expect(fix?.steps.at(-1)?.kind).toBe("note");
  });

  test("every_os_is_returned_once", () => {
    expect(ollamaOriginsFix(ID).map((fix) => fix.os)).toEqual(["linux", "macos", "windows"]);
  });
});
