import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { createReactNativePaperAdapter } from "../packages/adapter-react-native-paper/dist/index.js";
import {
  compileTheme,
  createThemeProject,
} from "../packages/compiler/dist/index.js";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const requireFromHere = createRequire(import.meta.url);
const reactNativeMetroConfig = requireFromHere("@react-native/metro-config");
const requireFromReactNativeMetroConfig = createRequire(
  requireFromHere.resolve("@react-native/metro-config/package.json"),
);
const requireFromMetroConfig = createRequire(
  requireFromReactNativeMetroConfig.resolve("metro-config/package.json"),
);
const metro = requireFromMetroConfig("metro");
const cacheRoot = path.join(root, "node_modules", ".cache");
await mkdir(cacheRoot, { recursive: true });
const temporaryRoot = await mkdtemp(
  path.join(cacheRoot, "theme-react-native-paper-"),
);

const expectedTargetVersions = {
  "react-native-paper": "5.15.3",
  "react-native": "0.86.3",
  "react-native-safe-area-context": "5.9.1",
  "@react-native/metro-config": "0.86.3",
  "@react-native/babel-preset": "0.86.3",
};

try {
  await verifyTargetVersions();
  const result = await compileTheme(createFixtureProject(), [
    createReactNativePaperAdapter(),
  ]);
  assert.equal(
    result.ok,
    true,
    `React Native Paper generation failed: ${JSON.stringify(result.diagnostics)}`,
  );
  if (!result.ok) throw new Error("Expected Paper compilation to succeed.");

  const generated = result.artifacts.find(
    ({ path: artifactPath }) => artifactPath === "react-native-paper/theme.ts",
  );
  assert.ok(generated, "Missing generated React Native Paper theme module.");
  assert.match(generated.content, /satisfies MD3Theme/);
  assert.match(generated.content, /"primary": "#0066cc"/);
  assert.match(generated.content, /"background": "#07090f"/);

  await writeFixture(generated.content);
  await typecheckFixture();
  await withProductionEnvironment(() =>
    Promise.all([bundleFixture("ios"), bundleFixture("android")]),
  );
  await verifyBundles();

  console.log(
    "Verified React Native Paper v5 with strict TypeScript and iOS/Android Metro production bundles.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function createFixtureProject() {
  const schemes = [
    {
      id: "light",
      roles: {
        primary: { ref: "palette.brand" },
        "primary-foreground": { ref: "palette.white" },
        secondary: { ref: "palette.accent" },
        "secondary-foreground": { ref: "palette.white" },
        background: { ref: "palette.white" },
        surface: { ref: "palette.surface" },
        foreground: { ref: "palette.ink" },
        "muted-foreground": { ref: "palette.muted" },
        divider: { ref: "palette.divider" },
      },
    },
    {
      id: "dark",
      roles: {
        primary: { ref: "palette.accent" },
        "primary-foreground": { ref: "palette.ink" },
        secondary: { ref: "palette.brand" },
        "secondary-foreground": { ref: "palette.white" },
        background: { ref: "palette.ink" },
        surface: { ref: "palette.dark-surface" },
        foreground: { ref: "palette.white" },
        "muted-foreground": { ref: "palette.muted-light" },
        divider: { ref: "palette.dark-divider" },
      },
    },
  ];

  return createThemeProject(
    {
      brand: "#0066cc",
      accent: "#8b5cf6",
      white: "#ffffff",
      surface: "#f8fafc",
      ink: "#07090f",
      "dark-surface": "#111827",
      muted: "#64748b",
      "muted-light": "#cbd5e1",
      divider: "#dbe3ef",
      "dark-divider": "#334155",
    },
    { id: "paper-target-fixture", name: "Paper target fixture", schemes },
  );
}

async function verifyTargetVersions() {
  for (const [packageName, expectedVersion] of Object.entries(
    expectedTargetVersions,
  )) {
    const manifestPath = path.join(
      root,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(
      manifest.version,
      expectedVersion,
      `Expected ${packageName}@${expectedVersion}, received ${String(manifest.version)}.`,
    );
  }
}

async function writeFixture(generatedTheme) {
  const generatedDirectory = path.join(
    temporaryRoot,
    "generated",
    "react-native-paper",
  );
  await mkdir(generatedDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(generatedDirectory, "theme.ts"),
      generatedTheme,
      "utf8",
    ),
    writeFile(
      path.join(temporaryRoot, "package.json"),
      '{"name":"paper-target-fixture","private":true,"type":"module"}\n',
      "utf8",
    ),
    writeFile(
      path.join(temporaryRoot, "babel.config.cjs"),
      'module.exports = { presets: ["module:@react-native/babel-preset"] };\n',
      "utf8",
    ),
    writeFile(
      path.join(temporaryRoot, "tsconfig.json"),
      renderTsconfig(),
      "utf8",
    ),
    writeFile(path.join(temporaryRoot, "index.tsx"), renderConsumer(), "utf8"),
  ]);
}

function renderTsconfig() {
  // Paper 5.15.3's published declarations reference internal `src/types`
  // modules and optional navigation/icon packages. `skipLibCheck` contains
  // those upstream declaration defects while strict mode still checks the
  // generated module and its MD3Theme assignments against the public types.
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        types: ["react"],
      },
      include: ["index.tsx", "generated/**/*.ts"],
    },
    null,
    2,
  )}\n`;
}

function renderConsumer() {
  return [
    'import * as React from "react";',
    'import { AppRegistry, useColorScheme } from "react-native";',
    'import { Button, PaperProvider, Text, type MD3Theme } from "react-native-paper";',
    'import { SafeAreaProvider } from "react-native-safe-area-context";',
    'import { paperThemes } from "./generated/react-native-paper/theme";',
    "",
    "const lightContract: MD3Theme = paperThemes.light;",
    "const darkContract: MD3Theme = paperThemes.dark;",
    "",
    "function PaperTargetFixture(): React.JSX.Element {",
    "  const scheme = useColorScheme();",
    '  const theme = scheme === "dark" ? darkContract : lightContract;',
    "  return (",
    "    <SafeAreaProvider>",
    "      <PaperProvider theme={theme}>",
    '        <Text variant="headlineSmall">Paper target fixture</Text>',
    '        <Button mode="contained" onPress={() => undefined}>',
    "          Compile theme",
    "        </Button>",
    "      </PaperProvider>",
    "    </SafeAreaProvider>",
    "  );",
    "}",
    "",
    'AppRegistry.registerComponent("PaperTargetFixture", () => PaperTargetFixture);',
    "",
  ].join("\n");
}

async function typecheckFixture() {
  const executable = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
  );
  await run(executable, ["-p", path.join(temporaryRoot, "tsconfig.json")], {
    cwd: temporaryRoot,
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 20_000_000,
  });
}

async function bundleFixture(platform) {
  const outputDirectory = path.join(temporaryRoot, "dist", platform);
  await mkdir(outputDirectory, { recursive: true });
  const config = reactNativeMetroConfig.mergeConfig(
    reactNativeMetroConfig.getDefaultConfig(temporaryRoot),
    {
      projectRoot: temporaryRoot,
      watchFolders: [root],
      resolver: {
        nodeModulesPaths: [path.join(root, "node_modules")],
        disableHierarchicalLookup: true,
        unstable_enableSymlinks: true,
      },
    },
  );
  await metro.runBuild(config, {
    entry: path.join(temporaryRoot, "index.tsx"),
    platform,
    dev: false,
    minify: true,
    sourceMap: false,
    out: path.join(outputDirectory, "index.js"),
  });
}

async function withProductionEnvironment(operation) {
  const previous = {
    babel: process.env.BABEL_ENV,
    node: process.env.NODE_ENV,
    noColor: process.env.NO_COLOR,
  };
  process.env.BABEL_ENV = "production";
  process.env.NODE_ENV = "production";
  process.env.NO_COLOR = "1";
  try {
    return await operation();
  } finally {
    restoreEnvironment("BABEL_ENV", previous.babel);
    restoreEnvironment("NODE_ENV", previous.node);
    restoreEnvironment("NO_COLOR", previous.noColor);
  }
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function verifyBundles() {
  for (const platform of ["ios", "android"]) {
    const bundle = await readFile(
      path.join(temporaryRoot, "dist", platform, "index.js"),
      "utf8",
    );
    assert.ok(
      bundle.length > 10_000,
      `${platform} Metro bundle is unexpectedly small.`,
    );
    assert.match(bundle, /Paper target fixture/);
    assert.match(bundle, /#0066cc/);
    assert.match(bundle, /#07090f/);
  }
}
