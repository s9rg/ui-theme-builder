import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { createCssAdapter } from "../packages/adapter-css/dist/index.js";
import { createDtcgAdapter } from "../packages/adapter-dtcg/dist/index.js";
import { createMuiAdapter } from "../packages/adapter-mui/dist/index.js";
import { createTailwindAdapter } from "../packages/adapter-tailwind/dist/index.js";
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
  const [dtcg, css, tailwind, mui] = await Promise.all([
    compileOne(createDtcgAdapter()),
    compileOne(createCssAdapter()),
    compileOne(createTailwindAdapter()),
    compileOne(createMuiAdapter()),
  ]);

  verifyDtcg(dtcg);
  verifyCss(css);
  await verifyTailwind(tailwind);
  await verifyMui(mui);
  await verifyCombinedCssTargets();
  console.log("Verified DTCG, CSS, Tailwind v4, and MUI v9 targets.");
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
