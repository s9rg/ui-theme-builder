# Generate and consume themes

This example compiles one explicit project for all four launch targets, writes the validated virtual
files, and then consumes each target in its intended environment.

## Install

```sh
npm install \
  @s9rg/theme-compiler \
  @s9rg/theme-adapter-dtcg \
  @s9rg/theme-adapter-css \
  @s9rg/theme-adapter-tailwind \
  @s9rg/theme-adapter-mui
```

## Generate

Save this as `scripts/generate-theme.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createCssAdapter } from "@s9rg/theme-adapter-css";
import { createDtcgAdapter } from "@s9rg/theme-adapter-dtcg";
import { createMuiAdapter } from "@s9rg/theme-adapter-mui";
import { createTailwindAdapter } from "@s9rg/theme-adapter-tailwind";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    accent: "#09b6d4",
    white: "#ffffff",
    paper: "#f8faff",
    muted: "#66708a",
    ink: "#13161f",
    night: "#07090f",
  },
  {
    id: "aurora",
    name: "Aurora product theme",
    schemes: [
      {
        id: "light",
        roles: {
          background: { ref: "palette.paper" },
          surface: { ref: "palette.white" },
          foreground: { ref: "palette.ink" },
          "muted-foreground": { ref: "palette.muted" },
          primary: { ref: "palette.brand" },
          "primary-foreground": { ref: "palette.white" },
          secondary: { ref: "palette.accent" },
          "secondary-foreground": { ref: "palette.ink" },
          divider: { ref: "palette.muted" },
        },
      },
      {
        id: "dark",
        roles: {
          background: { ref: "palette.night" },
          surface: { ref: "palette.ink" },
          foreground: { ref: "palette.white" },
          "muted-foreground": { ref: "palette.muted" },
          primary: { ref: "palette.brand" },
          "primary-foreground": { ref: "palette.white" },
          secondary: { ref: "palette.accent" },
          "secondary-foreground": { ref: "palette.ink" },
          divider: { ref: "palette.muted" },
        },
      },
    ],
  },
);

const schemeSelector = '[data-color-scheme="dark"]';
const result = await compileTheme(project, [
  createDtcgAdapter({ filePrefix: "brand" }),
  createCssAdapter({ prefix: "brand", darkSelector: schemeSelector }),
  createTailwindAdapter({ prefix: "brand", darkSelector: schemeSelector }),
  createMuiAdapter({ exportName: "brandTheme" }),
]);

if (!result.ok) {
  throw new Error(
    result.diagnostics
      .map(({ code, message }) => `${code}: ${message}`)
      .join("\n"),
  );
}

for (const diagnostic of result.diagnostics) {
  console.warn(
    `${diagnostic.severity}: ${diagnostic.code}: ${diagnostic.message}`,
  );
}

const outputRoot = resolve("src/generated");
for (const artifact of result.artifacts) {
  const destination = resolve(outputRoot, artifact.path);
  if (!destination.startsWith(`${outputRoot}${sep}`)) {
    throw new Error(`Refusing to write outside ${outputRoot}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, artifact.content, "utf8");
  console.log(`wrote ${artifact.path} (${artifact.mediaType})`);
}
```

Run it with:

```sh
node scripts/generate-theme.mjs
```

The output includes the target files below and `theme.lock.json`.

## Consume DTCG 2025.10

The generated DTCG files are:

- `brand.primitives.tokens.json` (`application/design-tokens+json`);
- `brand.light.tokens.json` and `brand.dark.tokens.json`
  (`application/design-tokens+json`);
- `brand.resolver.json` (`application/json`).

Configure a DTCG 2025.10 resolver-aware token tool with `src/generated/brand.resolver.json` as its
entrypoint. The resolver links the primitive file and selects the light/dark semantic context. A direct
JSON import is useful for inspecting the unresolved document, but aliases such as
`{color.palette.brand}` still require a resolver:

```js
import light from "./src/generated/brand.light.tokens.json" with { type: "json" };

console.log(light.color.semantic.primary.$value);
```

## Consume CSS custom properties

Load the generated stylesheet once:

```js
import "./generated/theme.css";

document.documentElement.dataset.colorScheme = "dark";
```

Use the generated semantic variables in component CSS:

```css
.button {
  color: var(--brand-semantic-primary-foreground);
  background: var(--brand-semantic-primary);
  border: 1px solid var(--brand-semantic-divider);
}
```

Primitive variables use `--brand-palette-<id>`. If a custom `darkSelector` would collide with a
generated selector for a non-dark scheme, the adapter reports a diagnostic and uses its safe default.

## Consume Tailwind CSS v4

Install Tailwind's build tool in the consuming project:

```sh
npm install --save-dev tailwindcss @tailwindcss/cli
```

Import Tailwind and the generated `@theme` file from the application's input CSS:

```css
@import "tailwindcss";
@import "./generated/theme.tailwind.css";
```

Compile the application stylesheet:

```sh
npx @tailwindcss/cli -i ./src/app.css -o ./dist/app.css
```

Semantic roles are now Tailwind color utilities backed by the selected scheme:

```html
<html data-color-scheme="dark">
  <body class="bg-background text-foreground">
    <button class="bg-primary text-primary-foreground">Save</button>
  </body>
</html>
```

The adapter output is intentionally named `theme.tailwind.css`, so it can be generated beside the
framework-neutral `theme.css` without an artifact collision.

## Consume Material UI v9

Install MUI and its styling peers in the consuming React application:

```sh
npm install @mui/material@^9 @emotion/react @emotion/styled react react-dom
```

Import the generated theme and pass it to the real provider:

```tsx
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import brandTheme from "./generated/theme";

export function App() {
  return (
    <ThemeProvider theme={brandTheme} defaultMode="dark" noSsr>
      <CssBaseline />
      <Button variant="contained">Save</Button>
    </ThemeProvider>
  );
}
```

`theme.ts` contains the same `createTheme` options used by the workbench's exact-runtime MUI preview.

## What the lockfile proves

`theme.lock.json` is verification evidence, not a reconstructive project format. It records a hash of
the authored project plus adapter identities and hashes of generated adapter artifacts. Re-running the
same project and adapters should reproduce the same lock data.

The lockfile does not contain the full primitive values, role bindings, authored option inputs,
diagnostics, or preview payloads. It does include normalized factory configuration (which must be
non-secret), stored inline from each adapter factory, but that is not the final project-derived
configuration or a reconstructive copy of the authored options. Artifact hashes bind the effective
result. Keep the authored `ThemeProject` and adapter options in source control. The alpha has a project
schema version but does not yet commit to a persistence format, compatibility window, or migration API.
