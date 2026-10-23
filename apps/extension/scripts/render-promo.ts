import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");
const ICON_PATH = resolve(ROOT, "assets/lambe-icon.svg");
const OUTPUT_PATH = resolve(ROOT, "docs/store/assets/promo-440x280.png");
const BROWSER = process.env.BRAVE_PATH ?? "brave";
const WIDTH = 440;
const HEIGHT = 280;

const page = (icon: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  :root { --ink: #e6edf3; --muted: #9da7b3; --accent: #7ee0c3; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    display: flex; align-items: center; gap: 28px; padding: 0 36px;
    background: linear-gradient(135deg, #133a33 0%, #0d1117 72%);
    color: var(--ink); font-family: "Inter", "Noto Sans", "DejaVu Sans", sans-serif;
  }
  svg { width: 128px; height: 128px; flex: none; filter: drop-shadow(0 0 1px rgb(126 224 195 / 0.6)) drop-shadow(0 12px 24px rgb(0 0 0 / 0.5)); }
  h1 { font-size: 46px; font-weight: 700; letter-spacing: -0.5px; line-height: 1; }
  p { margin-top: 12px; font-size: 17px; line-height: 1.35; color: var(--muted); }
  strong { color: var(--accent); font-weight: 600; }
</style>
</head>
<body>
${icon}
<div>
  <h1>Lambë</h1>
  <p>Translate pages and YouTube captions in place with <strong>your own model</strong>.</p>
</div>
</body>
</html>`;

const icon = await Bun.file(ICON_PATH).text();
const workDir = await mkdtemp(join(tmpdir(), "lambe-promo-"));
const htmlPath = join(workDir, "promo.html");

await writeFile(htmlPath, page(icon));

const browser = Bun.spawnSync(
  [
    BROWSER,
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${OUTPUT_PATH}`,
    `file://${htmlPath}`,
  ],
  { stdout: "inherit", stderr: "inherit" },
);

if (browser.exitCode !== 0) {
  console.error(`${BROWSER} exited with ${browser.exitCode}. Set BRAVE_PATH to a Chromium binary.`);
  process.exit(1);
}

console.log(`Promo tile written to ${OUTPUT_PATH}.`);
