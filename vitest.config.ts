import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const workspacePackages: readonly (readonly [string, string])[] = [
  ["@s9rg/theme-compiler", "./packages/compiler/src/index.ts"],
  ["@s9rg/theme-adapter-dtcg", "./packages/adapter-dtcg/src/index.ts"],
  ["@s9rg/theme-adapter-css", "./packages/adapter-css/src/index.ts"],
  ["@s9rg/theme-adapter-tailwind", "./packages/adapter-tailwind/src/index.ts"],
  ["@s9rg/theme-adapter-mui", "./packages/adapter-mui/src/index.ts"],
  ["@s9rg/theme-input-colorwheel", "./packages/input-colorwheel/src/index.ts"],
  ["@s9rg/theme-demo-protocol", "./packages/demo-protocol/src/index.ts"],
];

const workspacePackageAliases = Object.fromEntries(
  workspacePackages.map(([packageName, source]) => [
    packageName,
    fileURLToPath(new URL(source, import.meta.url)),
  ]),
);

export default defineConfig({
  // Tests exercise current source, not potentially stale publishable dist files.
  resolve: { alias: workspacePackageAliases },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
    },
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
    ],
  },
});
