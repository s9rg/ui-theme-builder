import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { createAngularMaterialAdapter } from "../packages/adapter-angular-material/dist/index.js";
import {
  compileTheme,
  createThemeProject,
} from "../packages/compiler/dist/index.js";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(root, "test", "targets", "angular-material");
const fixtureRequire = createRequire(
  path.join(fixtureRoot, "angular-material-fixture.cjs"),
);
const cacheRoot = path.join(fixtureRoot, "node_modules", ".cache");
await mkdir(cacheRoot, { recursive: true });
const temporaryRoot = await mkdtemp(path.join(cacheRoot, "generated-theme-"));

try {
  await verifyTargetVersions();
  const result = await compileTheme(createFixtureProject(), [
    createAngularMaterialAdapter(),
  ]);
  assert.equal(
    result.ok,
    true,
    `Angular Material generation failed: ${JSON.stringify(result.diagnostics)}`,
  );
  if (!result.ok)
    throw new Error("Expected Angular Material compilation to succeed.");

  const generated = result.artifacts.find(
    ({ path: artifactPath }) => artifactPath === "angular-material.theme.scss",
  );
  assert.ok(generated, "Missing generated Angular Material Sass artifact.");
  assert.match(generated.content, /@use '@angular\/material' as mat;/);
  assert.match(generated.content, /@include mat\.theme\(\(/);
  assert.match(generated.content, /@include mat\.theme-overrides\(\(/);

  await writeFixture(generated.content);
  await Promise.all([compileSass(), compileAngularTemplate()]);
  await verifyCompiledCss();

  console.log(
    "Verified Angular Material v22 with real Sass compilation and strict Angular AOT template checking.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function createFixtureProject() {
  return createThemeProject(
    {
      brand: "#6750a4",
      accent: "#2563eb",
      white: "#ffffff",
      paper: "#f8fafc",
      ink: "#07090f",
      night: "#111827",
      muted: "#64748b",
      "muted-light": "#cbd5e1",
      divider: "#dbe3ef",
      "dark-divider": "#334155",
    },
    {
      id: "angular-material-target-fixture",
      schemes: [
        {
          id: "light",
          roles: {
            primary: { ref: "palette.brand" },
            "primary-foreground": { ref: "palette.white" },
            secondary: { ref: "palette.accent" },
            background: { ref: "palette.white" },
            surface: { ref: "palette.paper" },
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
            surface: { ref: "palette.night" },
            foreground: { ref: "palette.white" },
            "muted-foreground": { ref: "palette.muted-light" },
            divider: { ref: "palette.dark-divider" },
          },
        },
      ],
    },
  );
}

async function verifyTargetVersions() {
  const expected = {
    "@angular/material": "22.1.4",
    "@angular/compiler-cli": "22.1.4",
    typescript: "6.0.3",
    sass: "1.103.1",
  };
  for (const [packageName, version] of Object.entries(expected)) {
    const manifestPath = path.join(
      fixtureRoot,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(
      manifest.version,
      version,
      `Expected ${packageName}@${version}, received ${String(manifest.version)}.`,
    );
  }
}

async function writeFixture(themeSource) {
  await Promise.all([
    writeFile(path.join(temporaryRoot, "theme.scss"), themeSource, "utf8"),
    writeFile(path.join(temporaryRoot, "app.ts"), renderComponent(), "utf8"),
    writeFile(
      path.join(temporaryRoot, "tsconfig.json"),
      renderTsconfig(),
      "utf8",
    ),
  ]);
}

async function compileSass() {
  const sass = fixtureRequire("sass");
  const result = await sass.compileAsync(
    path.join(temporaryRoot, "theme.scss"),
    {
      loadPaths: [path.join(fixtureRoot, "node_modules")],
      style: "compressed",
    },
  );
  await writeFile(path.join(temporaryRoot, "theme.css"), result.css, "utf8");
}

async function compileAngularTemplate() {
  const executable = path.join(
    fixtureRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "ngc.cmd" : "ngc",
  );
  await run(executable, ["-p", path.join(temporaryRoot, "tsconfig.json")], {
    cwd: temporaryRoot,
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 20_000_000,
  });
}

async function verifyCompiledCss() {
  const css = await readFile(path.join(temporaryRoot, "theme.css"), "utf8");
  assert.match(css, /--mat-sys-primary:\s*#6750a4/);
  assert.match(css, /--mat-sys-on-primary:\s*#fff/);
  assert.match(css, /\.theme-dark\{/);
  assert.match(css, /--mat-sys-primary:\s*#2563eb/);
  assert.match(css, /--mat-sys-background:\s*#07090f/);
}

function renderComponent() {
  return [
    'import { Component } from "@angular/core";',
    'import { MatButtonModule } from "@angular/material/button";',
    'import { MatCardModule } from "@angular/material/card";',
    "",
    "@Component({",
    '  selector: "theme-target-fixture",',
    "  standalone: true,",
    "  imports: [MatButtonModule, MatCardModule],",
    "  template: `",
    "    <mat-card>",
    "      <mat-card-header><mat-card-title>Theme target</mat-card-title></mat-card-header>",
    "      <mat-card-content>Generated colors</mat-card-content>",
    '      <mat-card-actions><button matButton="filled">Compile theme</button></mat-card-actions>',
    "    </mat-card>",
    "  `,",
    "})",
    "export class ThemeTargetFixture {}",
    "",
  ].join("\n");
}

function renderTsconfig() {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: false,
        experimentalDecorators: true,
        useDefineForClassFields: false,
        outDir: "./dist",
      },
      angularCompilerOptions: {
        compilationMode: "full",
        strictTemplates: true,
      },
      files: ["app.ts"],
    },
    null,
    2,
  )}\n`;
}
