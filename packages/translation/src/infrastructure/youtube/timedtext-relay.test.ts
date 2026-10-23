import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAIN_WORLD_MODULES = ["./timedtext-relay.ts", "./timedtext-hook.ts"].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);

const COUNT_CODE_FROM_STRINGS = `
let built = 0;
const original = Function;
globalThis.Function = new Proxy(original, {
  apply(target, self, args) { built += 1; return Reflect.apply(target, self, args); },
  construct(target, args) { built += 1; return Reflect.construct(target, args); },
});
for (const path of ${JSON.stringify(MAIN_WORLD_MODULES)}) await import(path);
console.log(built);
`;

describe("timedtext relay", () => {
  test("main_world_modules_never_build_code_from_strings", () => {
    const run = spawnSync(process.execPath, ["-e", COUNT_CODE_FROM_STRINGS], { encoding: "utf8" });

    expect(run.stderr).toBe("");
    expect(run.stdout.trim()).toBe("0");
  });
});
