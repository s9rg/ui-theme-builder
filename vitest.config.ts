import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const workspacePackages: readonly (readonly [string, string])[] = [
  ["@s9rg/theme-compiler", "./packages/compiler/src/index.ts"],
  ["@s9rg/theme-adapter-dtcg", "./packages/adapter-dtcg/src/index.ts"],
  ["@s9rg/theme-adapter-css", "./packages/adapter-css/src/index.ts"],
  ["@s9rg/theme-adapter-tailwind", "./packages/adapter-tailwind/src/index.ts"],
  ["@s9rg/theme-adapter-mui", "./packages/adapter-mui/src/index.ts"],
  ["@s9rg/theme-adapter-antd", "./packages/adapter-antd/src/index.ts"],
  ["@s9rg/theme-adapter-shadcn", "./packages/adapter-shadcn/src/index.ts"],
  ["@s9rg/theme-adapter-daisyui", "./packages/adapter-daisyui/src/index.ts"],
  ["@s9rg/theme-adapter-vuetify", "./packages/adapter-vuetify/src/index.ts"],
  [
    "@s9rg/theme-adapter-angular-material",
    "./packages/adapter-angular-material/src/index.ts",
  ],
  ["@s9rg/theme-adapter-ionic", "./packages/adapter-ionic/src/index.ts"],
  [
    "@s9rg/theme-adapter-react-native-paper",
    "./packages/adapter-react-native-paper/src/index.ts",
  ],
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
    server: {
      deps: {
        // The pinned Material color utilities build contains extensionless
        // transitive ESM imports. Inline it exactly as the publishable Angular
        // Material adapter does so tests exercise the bundled runtime path.
        inline: ["@material/material-color-utilities"],
      },
    },
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
