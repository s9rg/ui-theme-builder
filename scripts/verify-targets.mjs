import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { promisify } from "node:util";

import { createCssAdapter } from "../packages/adapter-css/dist/index.js";
import { createDaisyUiAdapter } from "../packages/adapter-daisyui/dist/index.js";
import { createDtcgAdapter } from "../packages/adapter-dtcg/dist/index.js";
import { createAntdAdapter } from "../packages/adapter-antd/dist/index.js";
import { createAngularMaterialAdapter } from "../packages/adapter-angular-material/dist/index.js";
import { createIonicAdapter } from "../packages/adapter-ionic/dist/index.js";
import { createMuiAdapter } from "../packages/adapter-mui/dist/index.js";
import { createReactNativePaperAdapter } from "../packages/adapter-react-native-paper/dist/index.js";
import { createShadcnAdapter } from "../packages/adapter-shadcn/dist/index.js";
import { createTailwindAdapter } from "../packages/adapter-tailwind/dist/index.js";
import { createVuetifyAdapter } from "../packages/adapter-vuetify/dist/index.js";
import {
  compileTheme,
  createThemeProject,
} from "../packages/compiler/dist/index.js";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const cacheRoot = path.join(root, "node_modules", ".cache");
await mkdir(cacheRoot, { recursive: true });
const temporaryRoot = await mkdtemp(path.join(cacheRoot, "theme-targets-"));

const schemes = [
  {
    id: "light",
    roles: {
      primary: { ref: "palette.brand" },
      "primary-foreground": { ref: "palette.white" },
      secondary: { ref: "palette.accent" },
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
      background: { ref: "palette.ink" },
      surface: { ref: "palette.dark-surface" },
      foreground: { ref: "palette.white" },
      "muted-foreground": { ref: "palette.muted-light" },
      divider: { ref: "palette.dark-divider" },
    },
  },
];

const project = createThemeProject(
  {
    brand: "#2563eb",
    accent: "#a855f7",
    white: "#ffffff",
    surface: "#f8fafc",
    ink: "#07090f",
    "dark-surface": "#111827",
    muted: "#64748b",
    "muted-light": "#cbd5e1",
    divider: "#dbe3ef",
    "dark-divider": "#334155",
  },
  { id: "target-fixture", name: "Target fixture", schemes },
);

try {
  const [dtcg, css, tailwind, mui, antd, shadcn, daisyui, vuetify, ionic] =
    await Promise.all([
      compileOne(createDtcgAdapter()),
      compileOne(createCssAdapter()),
      compileOne(createTailwindAdapter()),
      compileOne(createMuiAdapter()),
      compileOne(createAntdAdapter()),
      compileOne(createShadcnAdapter()),
      compileOne(createDaisyUiAdapter()),
      compileOne(createVuetifyAdapter()),
      compileOne(createIonicAdapter()),
    ]);

  verifyDtcg(dtcg);
  verifyCss(css);
  await verifyTailwind(tailwind);
  await verifyMui(mui);
  await verifyAntd(antd);
  await verifyShadcn(shadcn);
  await verifyDaisyUi(daisyui);
  await verifyVuetify(vuetify);
  await verifyIonic(ionic);
  await verifyCombinedCssTargets();
  await verifyCombinedLaunchTargets();
  console.log(
    "Verified DTCG, CSS, Tailwind v4, MUI v9, Ant Design v6, shadcn v4, daisyUI v5, Vuetify v4, and Ionic v9 targets.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function compileOne(adapter) {
  const result = await compileTheme(project, [adapter]);
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  assert.equal(
    result.ok,
    true,
    `${adapter.manifest.id} failed: ${JSON.stringify(errors)}`,
  );
  assert.ok(result.graph, `${adapter.manifest.id} did not return a graph`);
  assert.ok(
    result.lockfile,
    `${adapter.manifest.id} did not return a lockfile`,
  );
  return result;
}

function artifact(result, filename) {
  const found = result.artifacts.find((entry) => entry.path === filename);
  assert.ok(found, `Missing generated artifact ${filename}`);
  return found;
}

function verifyDtcg(result) {
  assert.equal(
    artifact(result, "theme.primitives.tokens.json").mediaType,
    "application/design-tokens+json",
  );
  assert.equal(
    artifact(result, "theme.resolver.json").mediaType,
    "application/json",
  );
  const primitives = JSON.parse(
    artifact(result, "theme.primitives.tokens.json").content,
  );
  const light = JSON.parse(artifact(result, "theme.light.tokens.json").content);
  const dark = JSON.parse(artifact(result, "theme.dark.tokens.json").content);
  const resolver = JSON.parse(artifact(result, "theme.resolver.json").content);

  assert.equal(
    primitives.$schema,
    "https://www.designtokens.org/schemas/2025.10/format.json",
  );
  assert.deepEqual(primitives.color.palette.brand.$value, {
    colorSpace: "srgb",
    components: [37 / 255, 99 / 255, 235 / 255],
    alpha: 1,
    hex: "#2563eb",
  });
  assert.equal(light.color.semantic.primary.$value, "{color.palette.brand}");
  assert.equal(dark.color.semantic.primary.$value, "{color.palette.accent}");
  assert.equal(
    resolver.$schema,
    "https://www.designtokens.org/schemas/2025.10/resolver.json",
  );
  assert.deepEqual(resolver.resolutionOrder, [
    { $ref: "#/sets/foundation" },
    { $ref: "#/modifiers/theme" },
  ]);
  assert.equal(resolver.modifiers.theme.default, "light");
  assert.deepEqual(Object.keys(resolver.modifiers.theme.contexts), [
    "dark",
    "light",
  ]);
}

function verifyCss(result) {
  const source = artifact(result, "theme.css").content;
  assert.match(source, /:root\s*\{/);
  assert.match(source, /--theme-semantic-primary:\s*color\(srgb/);
  assert.match(source, /\[data-theme="dark"\]\s*\{/);
  assert.doesNotMatch(source, /javascript:|url\s*\(/i);
}

async function verifyTailwind(result) {
  const directory = path.join(temporaryRoot, "tailwind");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "theme.css"),
    artifact(result, "theme.tailwind.css").content,
  );
  await writeFile(
    path.join(directory, "fixture.html"),
    '<main class="bg-background text-foreground"><button class="bg-primary text-primary-foreground border-divider">Action</button><span class="bg-palette-brand"></span></main>\n',
  );
  await writeFile(
    path.join(directory, "input.css"),
    '@import "tailwindcss";\n@source "./fixture.html";\n@import "./theme.css";\n',
  );

  await run(
    path.join(root, "node_modules", ".bin", "tailwindcss"),
    ["-i", "input.css", "-o", "output.css", "--minify"],
    { cwd: directory, env: { ...process.env, NO_COLOR: "1" } },
  );
  const output = await readFile(path.join(directory, "output.css"), "utf8");
  assert.match(output, /\.bg-primary\{/);
  assert.match(output, /\.text-primary-foreground\{/);
  assert.match(output, /\.bg-palette-brand\{/);
  assert.match(output, /--theme-semantic-primary:/);
  assert.match(output, /\[data-theme=dark\]/);
}

async function verifyCombinedCssTargets() {
  const result = await compileTheme(project, [
    createCssAdapter(),
    createTailwindAdapter(),
  ]);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(
    result.artifacts.some((entry) => entry.path === "theme.css"),
    "Combined compile is missing CSS output",
  );
  assert.ok(
    result.artifacts.some((entry) => entry.path === "theme.tailwind.css"),
    "Combined compile is missing Tailwind output",
  );
}

async function verifyCombinedLaunchTargets() {
  const adapters = [
    createDtcgAdapter(),
    createCssAdapter(),
    createTailwindAdapter(),
    createMuiAdapter(),
    createAntdAdapter(),
    createShadcnAdapter(),
    createDaisyUiAdapter(),
    createVuetifyAdapter(),
    createAngularMaterialAdapter(),
    createIonicAdapter(),
    createReactNativePaperAdapter(),
  ];
  const result = await compileTheme(project, adapters);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(
    new Set(result.artifacts.map(({ adapterId }) => adapterId)).size,
    adapters.length + 1,
    "Combined compile did not preserve every adapter plus the compiler lockfile",
  );
  assert.equal(
    new Set(result.artifacts.map(({ path: artifactPath }) => artifactPath))
      .size,
    result.artifacts.length,
    "Combined launch compile emitted colliding paths",
  );
}

async function verifyMui(result) {
  const preview = result.previews["mui@9"];
  assert.ok(preview && typeof preview === "object" && !Array.isArray(preview));
  assert.equal(preview.kind, "mui-theme-options");
  assert.equal(preview.themeOptions.cssVariables.colorSchemeSelector, "data");
  assert.equal(
    preview.themeOptions.colorSchemes.light.palette.primary.main,
    "#2563eb",
  );
  assert.equal(
    preview.themeOptions.colorSchemes.dark.palette.background.default,
    "#07090f",
  );

  const directory = path.join(temporaryRoot, "mui");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "theme.ts"),
    artifact(result, "theme.ts").content,
  );
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}\n');
  await writeFile(
    path.join(directory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          skipLibCheck: false,
        },
        include: ["theme.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await run(
    path.join(root, "node_modules", ".bin", "tsc"),
    ["-p", "tsconfig.json"],
    { cwd: directory, env: { ...process.env, NO_COLOR: "1" } },
  );

  const { createTheme } = await import("@mui/material/styles");
  const theme = createTheme(preview.themeOptions);
  assert.equal(theme.colorSchemes.light.palette.primary.main, "#2563eb");
  assert.equal(theme.colorSchemes.dark.palette.background.default, "#07090f");
  assert.equal(theme.colorSchemeSelector, "data");
}

async function verifyAntd(result) {
  const source = artifact(result, "antd/theme.ts").content;
  assert.match(source, /ThemeConfig/);
  assert.match(source, /antdTheme\.darkAlgorithm/);
  await typecheckTypeScriptArtifact("antd", "theme.ts", source, true);

  const preview = result.previews["antd@6"];
  assert.ok(preview && typeof preview === "object" && !Array.isArray(preview));
  assert.equal(preview.kind, "antd-theme-configs");
  const { theme: antdTheme } = await import("antd");
  const light = antdTheme.getDesignToken({
    algorithm: antdTheme.defaultAlgorithm,
    token: preview.themes.light.token,
  });
  const dark = antdTheme.getDesignToken({
    algorithm: antdTheme.darkAlgorithm,
    token: preview.themes.dark.token,
  });
  assert.equal(typeof light.colorPrimary, "string");
  assert.equal(typeof dark.colorPrimary, "string");
  assert.notEqual(light.colorPrimary, dark.colorPrimary);
  assert.equal(preview.themes.light.token.colorPrimary, "#2563eb");
  assert.equal(preview.themes.dark.token.colorPrimary, "#a855f7");
  assert.equal(preview.themes.light.token.colorBgLayout, "#ffffff");
  assert.equal(preview.themes.dark.token.colorBgLayout, "#07090f");
}

async function verifyShadcn(result) {
  const item = JSON.parse(artifact(result, "shadcn/theme.json").content);
  const { registryItemSchema } = await import("shadcn/schema");
  const parsed = registryItemSchema.safeParse(item);
  assert.equal(
    parsed.success,
    true,
    parsed.success ? undefined : JSON.stringify(parsed.error.issues),
  );
  assert.equal(item.type, "registry:theme");
  assert.equal(
    item.cssVars.light.primary,
    "rgb(14.509804% 38.823529% 92.156863%)",
  );
  assert.equal(
    item.cssVars.dark.background,
    "rgb(2.745098% 3.529412% 5.882353%)",
  );

  // This is the exact CSS-variable transformer bundled by our pinned shadcn
  // CLI. Its public install API performs network/config work, so this focused
  // compatibility probe catches color rewrites before any files are touched.
  const shadcnChunk = new URL(
    "../node_modules/shadcn/dist/chunk-CDOZT3OO.js",
    import.meta.url,
  );
  const { Ia: updateCssVars } = await import(shadcnChunk.href);
  const installedCss = await updateCssVars(
    '@import "tailwindcss";\n@theme inline {}\n',
    item.cssVars,
    { resolvedPaths: { cwd: root, tailwindCss: "/unused" } },
    { tailwindVersion: "v4", overwriteCssVars: true },
  );
  assert.doesNotMatch(installedCss, /hsl\(hwb\(/);
  assert.match(installedCss, /--color-primary:\s*var\(--primary\)/);
  assert.match(installedCss, /--color-background:\s*var\(--background\)/);
  assert.match(
    installedCss,
    /--primary:\s*rgb\(14\.509804% 38\.823529% 92\.156863%\)/,
  );
}

async function verifyDaisyUi(result) {
  const directory = path.join(temporaryRoot, "daisyui");
  await mkdir(directory, { recursive: true });
  const source = artifact(result, "daisyui/theme.css").content;
  await writeFile(path.join(directory, "theme.css"), source);
  await writeFile(
    path.join(directory, "fixture.html"),
    '<button class="btn btn-primary">Action</button><main class="bg-base-200 text-base-content"></main>\n',
  );
  await writeFile(
    path.join(directory, "input.css"),
    '@import "tailwindcss";\n@source "./fixture.html";\n@import "./theme.css";\n',
  );
  await run(
    path.join(root, "node_modules", ".bin", "tailwindcss"),
    ["-i", "input.css", "-o", "output.css", "--minify"],
    { cwd: directory, env: { ...process.env, NO_COLOR: "1" } },
  );
  const output = await readFile(path.join(directory, "output.css"), "utf8");
  assert.match(output, /\.btn\{/);
  assert.match(output, /\.btn-primary/);
  assert.match(
    output,
    /--color-primary:color\(srgb \.145098 \.388235 \.921569\)/,
  );
  assert.match(output, /--color-base-200:color\(srgb 1 1 1\)/);
}

async function verifyVuetify(result) {
  const source = artifact(result, "vuetify.theme.ts").content;
  assert.match(source, /ThemeDefinition/);
  // Vuetify v4's own declarations currently fail strict library checking;
  // strict mode still checks the generated ThemeDefinition assignment.
  await typecheckTypeScriptArtifact("vuetify", "theme.ts", source, true);

  const preview = result.previews["vuetify@4"];
  assert.ok(preview && typeof preview === "object" && !Array.isArray(preview));
  assert.equal(preview.kind, "vuetify-theme-options");
  const { createVuetify } = await import("vuetify");
  const plugin = createVuetify({
    theme: { defaultTheme: preview.defaultTheme, themes: preview.themes },
  });
  assert.ok(plugin, "Vuetify rejected its generated theme options");
  assert.match(plugin.theme.styles.value, /--v-border-color:\s*219, 227, 239/);
  assert.match(plugin.theme.styles.value, /--v-border-opacity:\s*1/);
  assert.doesNotMatch(
    plugin.theme.styles.value,
    /--v-border-color:\s*(?:hsl|hsla|#[0-9a-f]{8})/i,
  );
  const themeColorChannels = [
    ...plugin.theme.styles.value.matchAll(
      /--v-theme-([a-z0-9-]+):\s*([^;\n]+);/gi,
    ),
  ].filter(
    ([, name]) =>
      name !== "overlay-multiplier" && !name.endsWith("-overlay-multiplier"),
  );
  for (const [, name, channels] of themeColorChannels) {
    assert.equal(
      channels.split(",").length,
      3,
      `Vuetify theme color ${name} did not compile to three RGB channels`,
    );
  }
  assert.equal(preview.themes.light.colors.primary, "#2563eb");
  assert.equal(preview.themes.dark.colors.background, "#07090f");
}

async function verifyIonic(result) {
  const source = artifact(result, "ionic.theme.css").content;
  assert.match(source, /:root\s*\{/);
  assert.match(source, /\.ion-palette-dark\s*\{/);
  assert.match(source, /--ion-color-primary:\s*#2563eb/);
  assert.match(source, /--ion-color-primary-rgb:\s*37,99,235/);
  assert.match(source, /--ion-color-primary-contrast:\s*#ffffff/);
  assert.match(source, /--ion-color-primary-shade:/);
  assert.match(source, /--ion-color-primary-tint:/);
  assert.match(source, /--ion-background-color-step-50:/);
  assert.match(source, /--ion-text-color-step-950:/);
  assert.match(source, /--ion-card-background:\s*#f8fafc/);
  assert.match(source, /--ion-background-color:\s*#07090f/);

  const directory = path.join(temporaryRoot, "ionic");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "theme.css"), source),
    writeFile(
      path.join(directory, "index.html"),
      '<!doctype html><html><head><meta charset="UTF-8"></head><body><ion-app><ion-button color="primary">Action</ion-button></ion-app><script type="module" src="/main.js"></script></body></html>\n',
    ),
    writeFile(
      path.join(directory, "main.js"),
      'import "@ionic/core/css/core.css";\nimport { defineCustomElements } from "@ionic/core/loader";\nimport "./theme.css";\ndefineCustomElements(window);\n',
    ),
  ]);
  await run(
    path.join(root, "node_modules", ".bin", "vite"),
    ["build", "--outDir", "dist", "--emptyOutDir"],
    { cwd: directory, env: { ...process.env, NO_COLOR: "1" } },
  );
  const outputFiles = await readdir(path.join(directory, "dist", "assets"));
  const cssFile = outputFiles.find((filename) => filename.endsWith(".css"));
  assert.ok(cssFile, "Ionic Vite fixture emitted no CSS");
  const outputCss = await readFile(
    path.join(directory, "dist", "assets", cssFile),
    "utf8",
  );
  assert.match(outputCss, /--ion-color-primary:\s*#2563eb/);
  assert.match(outputCss, /\.ion-palette-dark/);
}

async function typecheckTypeScriptArtifact(
  directoryName,
  filename,
  source,
  skipLibCheck,
) {
  const directory = path.join(temporaryRoot, directoryName);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), source);
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}\n');
  await writeFile(
    path.join(directory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          skipLibCheck,
        },
        include: [filename],
      },
      null,
      2,
    )}\n`,
  );
  await run(path.join(root, "node_modules", ".bin", "tsc"), ["-p", "."], {
    cwd: directory,
    env: { ...process.env, NO_COLOR: "1" },
  });
}
