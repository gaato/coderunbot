/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-cross-feature-imports",
      comment: "Features are isolated and may only depend on platform/shared code.",
      severity: "error",
      scope: "folder",
      from: { path: "^src/features/([^/]+)$" },
      to: {
        path: "^src/features/[^/]+$",
        pathNot: "^src/features/$1$",
      },
    },
    {
      name: "platform-shared-do-not-know-features",
      severity: "error",
      from: { path: "^src/(platform|shared)/" },
      to: { path: "^src/features/" },
    },
    {
      name: "config-does-not-know-features",
      severity: "error",
      from: { path: "^src/config\\.ts$" },
      to: { path: "^src/features/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
  },
};
