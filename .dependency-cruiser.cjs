const PACKAGE_SRC = "^packages/[^/]+/src";

module.exports = {
  forbidden: [
    {
      name: "pure-domain",
      comment: "Domain imports only domain and @lambe/kernel.",
      severity: "error",
      from: { path: `${PACKAGE_SRC}/domain/` },
      to: {
        pathNot: [
          `${PACKAGE_SRC}/domain/`,
          "^packages/kernel/src/",
          "node_modules/zod/",
          "^bun:test$",
        ],
      },
    },
    {
      name: "application-imports-only-domain-and-kernel",
      comment: "Application imports only domain, application, @lambe/kernel and zod.",
      severity: "error",
      from: { path: `${PACKAGE_SRC}/application/` },
      to: {
        pathNot: [
          `${PACKAGE_SRC}/domain/`,
          `${PACKAGE_SRC}/application/`,
          "^packages/kernel/src/",
          "node_modules/zod/",
          "^bun:test$",
        ],
      },
    },
    {
      name: "packages-never-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-import-packages-through-exports",
      comment: "An app reaches a package by its name and exports, never by a relative path.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^packages/", dependencyTypes: ["local"] },
    },
    {
      name: "apps-use-only-exported-entry-points",
      comment: "A @lambe/* specifier that the package exports does not resolve is a deep import.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^@lambe/", couldNotResolve: true },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: ["/dist/", "/\\.output/", "/\\.wxt/"] },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "default"] },
  },
};
