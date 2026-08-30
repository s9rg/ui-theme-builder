# Generate and consume themes

This example compiles one explicit project for all eleven 0.6.0 targets, writes the validated virtual
files, and shows how each artifact enters its target toolchain. You can install and run only the
adapters your project needs; compiling a theme never installs or loads the target framework.

## Install the generator

Install the compiler and the adapters you want to call:

```sh
npm install \
  @s9rg/theme-compiler \
  @s9rg/theme-adapter-dtcg \
  @s9rg/theme-adapter-css \
  @s9rg/theme-adapter-tailwind \
  @s9rg/theme-adapter-mui \
  @s9rg/theme-adapter-antd \
  @s9rg/theme-adapter-shadcn \
  @s9rg/theme-adapter-daisyui \
  @s9rg/theme-adapter-vuetify \
  @s9rg/theme-adapter-angular-material \
  @s9rg/theme-adapter-ionic \
  @s9rg/theme-adapter-react-native-paper
```

Target frameworks are separate consumer dependencies. Their install commands appear with their
consumption examples below.

## Generate all targets

Save this as `scripts/generate-theme.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createAngularMaterialAdapter } from "@s9rg/theme-adapter-angular-material";
import { createAntdAdapter } from "@s9rg/theme-adapter-antd";
import { createCssAdapter } from "@s9rg/theme-adapter-css";
import { createDaisyUiAdapter } from "@s9rg/theme-adapter-daisyui";
import { createDtcgAdapter } from "@s9rg/theme-adapter-dtcg";
import { createIonicAdapter } from "@s9rg/theme-adapter-ionic";
import { createMuiAdapter } from "@s9rg/theme-adapter-mui";
import { createReactNativePaperAdapter } from "@s9rg/theme-adapter-react-native-paper";
import { createShadcnAdapter } from "@s9rg/theme-adapter-shadcn";
import { createTailwindAdapter } from "@s9rg/theme-adapter-tailwind";
import { createVuetifyAdapter } from "@s9rg/theme-adapter-vuetify";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    accent: "#09b6d4",
    white: "#ffffff",
    paper: "#f8faff",
    muted: "#66708a",
    divider: "#dbe3ef",
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
          divider: { ref: "palette.divider" },
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

const darkSelector = ".theme-dark";
const result = await compileTheme(project, [
  createDtcgAdapter({ filePrefix: "brand" }),
  createCssAdapter({ prefix: "brand", darkSelector }),
  createTailwindAdapter({ prefix: "brand", darkSelector }),
  createMuiAdapter({ exportName: "brandTheme" }),
  createAntdAdapter({ exportName: "brandThemes" }),
  createShadcnAdapter({ itemName: "aurora-theme" }),
  createDaisyUiAdapter(),
  createVuetifyAdapter({ exportName: "brandVuetify" }),
  createAngularMaterialAdapter({ darkSelector }),
  createIonicAdapter({ darkSelector }),
  createReactNativePaperAdapter(),
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

This configuration writes:

- `brand.primitives.tokens.json`, `brand.light.tokens.json`, `brand.dark.tokens.json`, and
  `brand.resolver.json` for DTCG;
- `theme.css` for framework-neutral custom properties;
- `theme.tailwind.css` for Tailwind CSS v4;
- `theme.ts` for Material UI;
- `antd/theme.ts` for Ant Design;
- `shadcn/theme.json` for shadcn;
- `daisyui/theme.css` for daisyUI;
- `vuetify.theme.ts` for Vuetify;
- `angular-material.theme.scss` for Angular Material;
- `ionic.theme.css` for Ionic;
- `react-native-paper/theme.ts` for React Native Paper;
- one compiler-owned `theme.lock.json` covering every adapter artifact.

## Consume DTCG 2025.10

Configure a DTCG 2025.10 resolver-aware token tool with
`src/generated/brand.resolver.json` as its entrypoint. The resolver links the primitive file and
selects the light/dark semantic context. A direct JSON import is useful for inspecting the unresolved
document, but aliases such as `{color.palette.brand}` still require a resolver:

```js
import light from "./generated/brand.light.tokens.json" with { type: "json" };

console.log(light.color.semantic.primary.$value);
// {color.palette.brand}
```

Token documents use `application/design-tokens+json`; the resolver uses `application/json`.

## Consume CSS custom properties

Load `theme.css` once and apply the same selector configured during generation:

```js
import "./generated/theme.css";

document.documentElement.classList.toggle("ion-palette-dark", prefersDark);
```

Use the generated semantic variables in component CSS:

```css
.button {
  color: var(--brand-semantic-primary-foreground);
  background: var(--brand-semantic-primary);
  border: 1px solid var(--brand-semantic-divider);
}
```

Primitive variables use `--brand-palette-<id>`. If a custom selector would collide with a generated
non-dark scheme selector, the adapter reports a diagnostic and uses its safe default.

## Consume Tailwind CSS v4

Install Tailwind's build tool:

```sh
npm install --save-dev tailwindcss@^4 @tailwindcss/cli@^4
```

Import Tailwind and `theme.tailwind.css` from the application's input CSS:

```css
@import "tailwindcss";
@import "./generated/theme.tailwind.css";
```

Compile the application stylesheet:

```sh
npx @tailwindcss/cli -i ./src/app.css -o ./dist/app.css
```

Semantic roles become Tailwind color utilities backed by the selected scheme:

```html
<html class="theme-dark">
  <body class="bg-background text-foreground">
    <button class="bg-primary text-primary-foreground">Save</button>
  </body>
</html>
```

The Tailwind artifact intentionally does not import Tailwind itself; the consuming application owns
its entrypoint and source discovery.

## Consume Material UI v9

Install MUI and its styling peers:

```sh
npm install @mui/material@^9 @emotion/react @emotion/styled react react-dom
```

Pass the generated theme to the provider:

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

## Consume Ant Design v6

Install Ant Design and its React peers:

```sh
npm install antd@^6 react react-dom
```

Choose the generated light or dark `ThemeConfig` at the provider boundary:

```tsx
import { ConfigProvider } from "antd";
import { brandThemes } from "./generated/antd/theme";

export function App({ dark, children }) {
  return (
    <ConfigProvider theme={brandThemes[dark ? "dark" : "light"]}>
      {children}
    </ConfigProvider>
  );
}
```

The module explicitly selects Ant's default and dark algorithms. Authored roles override compatible
seed/alias tokens; Ant derives the rest of its state palette. A generic `secondary` is not relabeled
as `info`, `success`, or `link`.

## Consume a shadcn v4 registry theme

Install the generated partial registry item with the current CLI:

```sh
npx shadcn@^4 add ./src/generated/shadcn/theme.json
```

The file has type `registry:theme` with `cssVars.light` and `cssVars.dark`. Only authored,
same-purpose roles are present. Existing project variables remain in control of omitted destructive,
chart, sidebar, focus-ring, and other semantics.

## Consume daisyUI v5

Install Tailwind and daisyUI:

```sh
npm install --save-dev tailwindcss@^4 @tailwindcss/cli@^4 daisyui@^5
```

Use `daisyui/theme.css` as the Tailwind entry file; it imports Tailwind, enables the built-in light
and dark themes, and applies the generated documented `daisyui/theme` overrides:

```sh
npx @tailwindcss/cli \
  -i ./src/generated/daisyui/theme.css \
  -o ./dist/theme.css
```

Set `data-theme="dark"` when an explicit choice should override the preferred scheme. Unauthored
status and state colors remain daisyUI defaults and are identified by diagnostics.

## Consume Vuetify v4

Install Vuetify and Vue:

```sh
npm install vuetify@^4 vue
```

Pass the generated provider options to `createVuetify`:

```ts
import { createVuetify } from "vuetify";
import brandVuetify from "./generated/vuetify.theme";

export const vuetify = createVuetify({ theme: brandVuetify });
```

The generated module exports typed light/dark `ThemeDefinition` values. Missing target status colors
inherit Vuetify defaults; the adapter does not synthesize a ramp.

## Consume Angular Material v22

Install Angular Material in a compatible Angular v22 application:

```sh
npm install @angular/material@^22
```

Load the self-contained generated Sass from the application's global stylesheet:

```scss
@use "./generated/angular-material.theme";
```

The light theme is scoped to `:root`; adding `theme-dark` to a containing element activates the dark
theme generated above. The adapter expands authored seeds with its pinned official Material Color
Utilities implementation into the full tonal-map shape required by `mat.theme`, then applies authored
same-purpose semantic roles with `mat.theme-overrides`. Angular Material supplies the remaining MD3
system roles.

## Consume Ionic v9

Install the wrapper for the application (`@ionic/react`, `@ionic/angular`, or `@ionic/vue`) or use
`@ionic/core` directly:

```sh
npm install @ionic/core@^9
```

Import `ionic.theme.css` after Ionic's core styles, then toggle the configured selector:

```js
import "@ionic/core/css/ionic.bundle.css";
import "./generated/ionic.theme.css";

document.documentElement.classList.toggle("ion-palette-dark", prefersDark);
```

One CSS artifact serves Ionic Core, React, Angular, and Vue. It contains each authored Ionic color's
base, RGB, contrast, contrast-RGB, shade, and tint variables plus stepped application colors. Shade,
tint, and steps are deterministic target-specific mixes and are reported in diagnostics.

## Consume React Native Paper v5

Install Paper and its native peers:

```sh
npm install \
  react-native-paper@^5 \
  react \
  react-native \
  react-native-safe-area-context
```

Select the generated theme at the provider boundary:

```tsx
import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { paperThemes } from "./generated/react-native-paper/theme";

export function App({ children }) {
  const scheme = useColorScheme();
  return (
    <PaperProvider
      theme={scheme === "dark" ? paperThemes.dark : paperThemes.light}
    >
      {children}
    </PaperProvider>
  );
}
```

The generated themes spread `MD3LightTheme` and `MD3DarkTheme`, then replace only authored roles.
Unauthored Material roles remain Paper defaults; no tonal palette is invented. The workbench preview
is labeled as a native-web approximation, while release fixtures separately typecheck the consumer and
bundle it through Metro for iOS and Android.

## Fidelity, inheritance, and diagnostics

Generation success means every emitted artifact passed the compiler's structural and output-boundary
validation. It does not mean every target received a complete framework theme:

- DTCG, CSS, and Tailwind preserve arbitrary valid semantic roles after deterministic name
  allocation.
- Framework adapters map only roles with a documented same-purpose target token. Unknown roles are
  skipped and diagnosed.
- Ant Design and Angular Material deliberately use their target algorithms for derived state/tonal
  values. Ionic's shade, tint, contrast fallback, and stepped values are mechanical documented
  derivations. These operations are disclosed by diagnostics.
- shadcn emits a partial theme; daisyUI, Vuetify, and React Native Paper preserve target defaults for
  missing roles.
- Structured colors that a JavaScript target cannot consume require an explicit six-digit sRGB
  fallback. CSS-shaped targets can preserve supported CSS color-space syntax.

Always review warnings and informational diagnostics alongside the generated code. The workbench's
preview fidelity label explains whether it is using a real provider, exact CSS variables, a semantic
mapping, a native-web approximation, or compile-only evidence.

## What the lockfile proves

`theme.lock.json` is verification evidence, not a reconstructive project format. It records a hash of
the authored project, adapter identities and normalized non-secret factory configuration, and hashes
of generated adapter artifacts. Re-running the same project and adapters should reproduce the same
lock data.

The lockfile does not contain the full primitive values, role bindings, authored option inputs,
diagnostics, or preview payloads. Artifact hashes bind the effective result, but authors must keep the
source `ThemeProject` and adapter options in source control. The 0.x line has a project schema version
but does not yet commit to a persistence encoding, compatibility window, or migration API.
