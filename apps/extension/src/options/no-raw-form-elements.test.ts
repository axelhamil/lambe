import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Glob } from "bun";

const RAW_FORM_ELEMENT = /<(button|input|select|textarea)[\s>/]/;

describe("options markup", () => {
  test("no_raw_form_elements_in_options", async () => {
    const files = await Array.fromAsync(
      new Glob("**/*.tsx").scan({ cwd: import.meta.dir, absolute: true }),
    );

    const sources = await Promise.all(
      files
        .filter((file) => !file.includes("/components/ui/"))
        .map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );

    const offenders = sources.filter(({ source }) => RAW_FORM_ELEMENT.test(source));

    expect(files.length).toBeGreaterThan(0);
    expect(offenders.map(({ file }) => file)).toEqual([]);
  });
});
