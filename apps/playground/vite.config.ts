import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { thirdPartyNoticesPlugin } from "./third-party-notices";

const workspacePackages: readonly (readonly [string, string])[] = [
  ["@s9rg/theme-compiler", "../../packages/compiler/src/index.ts"],
  ["@s9rg/theme-adapter-dtcg", "../../packages/adapter-dtcg/src/index.ts"],
  ["@s9rg/theme-adapter-css", "../../packages/adapter-css/src/index.ts"],
  [
    "@s9rg/theme-adapter-tailwind",
    "../../packages/adapter-tailwind/src/index.ts",
  ],
  ["@s9rg/theme-adapter-mui", "../../packages/adapter-mui/src/index.ts"],
  [
    "@s9rg/theme-input-colorwheel",
    "../../packages/input-colorwheel/src/index.ts",
  ],
  ["@s9rg/theme-demo-protocol", "../../packages/demo-protocol/src/index.ts"],
];

const workspacePackageAliases = Object.fromEntries(
  workspacePackages.map(([packageName, source]) => [
    packageName,
    fileURLToPath(new URL(source, import.meta.url)),
  ]),
);

function normalizeBase(value: string | undefined): string {
  const base = value?.trim() || "/ui-theme-builder/";
  return `/${base.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE_PATH),
  plugins: [react(), thirdPartyNoticesPlugin()],
  // The package manifests intentionally point to publishable dist files. The
  // workbench resolves workspace packages to source so a fresh clone can run
  // `npm run dev` before any package build, while retaining HMR for package edits.
  resolve: { alias: workspacePackageAliases },
  build: {
    sourcemap: false,
    target: "es2022",
  },
});
