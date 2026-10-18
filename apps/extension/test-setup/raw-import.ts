import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { plugin } from "bun";

const RAW_SUFFIX = /\?raw$/;

plugin({
  name: "raw-import",
  setup(build) {
    build.onResolve({ filter: RAW_SUFFIX }, (args) => ({
      path: resolve(dirname(args.importer), args.path.replace(RAW_SUFFIX, "")),
      namespace: "raw",
    }));

    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({
      contents: `export default ${JSON.stringify(await readFile(args.path, "utf8"))};`,
      loader: "js",
    }));
  },
});
