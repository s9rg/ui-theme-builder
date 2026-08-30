# UI Theme Builder

UI Theme Builder turns a Colorwheel palette into previewable, downloadable theme files for popular
UI libraries and CSS formats. Its headless Theme Compiler engine keeps color primitives, semantic
bindings, diagnostics, and generated artifacts deterministic.

Version 0.6.0 expands the first public release into an eleven-target generator catalog. Alongside
DTCG 2025.10, CSS custom properties, Tailwind CSS v4, and Material UI v9, it adds Ant Design v6,
shadcn registry themes, daisyUI v5, Vuetify v4, Angular Material v22, Ionic v9, and React Native
Paper v5. The React/Vite workbench is built with
[`@s9rg/colorwheel`](https://www.npmjs.com/package/@s9rg/colorwheel).

[Open the UI Theme Builder workbench](https://s9rg.github.io/ui-theme-builder/)

## Why a compiler?

A palette is not yet a UI theme. Theme Compiler keeps that boundary visible:

- palette colors become named primitives;
- callers bind semantic roles such as `primary` or `background` explicitly;
- the compiler validates and resolves one immutable `ThemeGraph`;
- adapters turn that graph into virtual files and JSON preview data;
- a successful compile includes a deterministic `theme.lock.json` as verification evidence.

The compiler never guesses semantics from array order and the workbench never evaluates generated
JavaScript or TypeScript.

## Quick start

```ts
import { createCssAdapter } from "@s9rg/theme-adapter-css";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    paper: "#f8faff",
    ink: "#13161f",
  },
  {
    id: "acme",
    schemes: [
      {
        id: "light",
        roles: {
          primary: { ref: "palette.brand" },
          background: { ref: "palette.paper" },
          foreground: { ref: "palette.ink" },
        },
      },
    ],
  },
);

const result = await compileTheme(project, [createCssAdapter()]);

if (!result.ok) {
  throw new Error(result.diagnostics.map(({ message }) => message).join("\n"));
}

for (const file of result.artifacts) {
  console.log(file.path, file.content);
}
```

String color inputs intentionally accept only `#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA`.
Structured DTCG-shaped colors are supported when another color space is required.

See [Generate and consume themes](docs/GENERATE_AND_CONSUME.md) for end-to-end generation and target
consumption examples.

## Packages

- `@s9rg/theme-compiler` — project model, validation, compiler, and adapter ABI.
- `@s9rg/theme-adapter-dtcg` — DTCG 2025.10 format and resolver documents.
- `@s9rg/theme-adapter-css` — framework-neutral CSS custom properties.
- `@s9rg/theme-adapter-tailwind` — Tailwind CSS v4 `@theme` output.
- `@s9rg/theme-adapter-mui` — Material UI v9 `createTheme` options.
- `@s9rg/theme-adapter-antd` — Ant Design v6 light and dark `ThemeConfig` exports.
- `@s9rg/theme-adapter-shadcn` — shadcn `registry:theme` JSON.
- `@s9rg/theme-adapter-daisyui` — daisyUI v5 plugin theme blocks.
- `@s9rg/theme-adapter-vuetify` — Vuetify v4 `ThemeDefinition` exports.
- `@s9rg/theme-adapter-angular-material` — Angular Material v22 Material 3 Sass themes.
- `@s9rg/theme-adapter-ionic` — Ionic v9 cross-framework CSS variables.
- `@s9rg/theme-adapter-react-native-paper` — React Native Paper v5 MD3 themes.
- `@s9rg/theme-input-colorwheel` — explicit Colorwheel palette-to-project conversion.
- `@s9rg/theme-demo-protocol` — runtime-validated preview message data.

Every successful compile also emits the compiler-owned `theme.lock.json`. With default adapter
options, the target artifacts are:

- DTCG: `theme.primitives.tokens.json`, one `theme.<scheme>.tokens.json` per scheme, and
  `theme.resolver.json`;
- CSS: `theme.css`;
- Tailwind CSS: `theme.tailwind.css`;
- Material UI: `theme.ts`;
- Ant Design: `antd/theme.ts`;
- shadcn: `shadcn/theme.json`;
- daisyUI: `daisyui/theme.css`;
- Vuetify: `vuetify.theme.ts`;
- Angular Material: `angular-material.theme.scss`;
- Ionic: `ionic.theme.css`;
- React Native Paper: `react-native-paper/theme.ts`.

Target frameworks are not adapter runtime dependencies. The Angular Material adapter uses the same
open-source Material Color Utilities implementation as Angular's official palette schematic; other
target packages are installed only as development fixtures. Material UI is bundled in the demo solely
for its exact provider preview.

## Workbench

```sh
npm ci
npm run dev
```

The workbench follows three primary steps: choose one seed and a color-theory relationship, choose a
library or format, then preview the result and export it. Colorwheel generates 2–5 linked brand colors
for Complementary, Analogous, Triadic, Split complementary, Tetradic, or Monochromatic recipes. A
separate disclosed neutral foundation supplies UI surfaces, text, and borders; these are not presented
as independent palette pickers or harmony output. Starter light and dark semantic mappings are
explicit and available through the advanced mapping disclosure. The result step shows preview
fidelity, diagnostics, generated code, per-file actions, and a complete ZIP download containing every
artifact plus `theme.lock.json`.

Preview fidelity is disclosed per target. MUI is rendered by its real provider and CSS applies the
exact resolved custom properties. DTCG, Tailwind, Ant Design, shadcn, daisyUI, Vuetify, and Ionic use
mapped semantic previews; Angular Material is compile-verified; React Native Paper uses a web
approximation backed by separate native Metro bundle checks. A mapped preview is useful product
feedback, but is not represented as the target framework itself.

The preview message package is an early 0.x data contract used in-process today. Secure cross-document
transport, including origin checks, session nonces, and rendered acknowledgements, remains future work.

## Development

Use Node.js 20.19.x, 22.13 or newer, or 24 or newer for workspace development. This range follows the
strictest current toolchain requirement (ESLint 10); Vite 7 also excludes early Node 22 releases. The
public packages declare Node 20.19 as their supported Node runtime floor and also target modern browser
bundlers. Theme compilation requires `WebCrypto.SubtleCrypto` and `TextEncoder` in the host.

```sh
npm ci
npm run check
```

Vite and Vitest resolve workspace packages directly to their TypeScript source. A fresh clone can run
`npm run dev` or `npm test` after `npm ci` without building package `dist` directories first, and
package edits participate in Vite's normal update cycle.

`theme.lock.json` is not a source or backup format: it contains hashes and identities, not the complete
palette or semantic bindings. It includes normalized factory configuration (which must be non-secret)
as evidence, not the final project-derived output configuration or a substitute for the authored
option source. Keep the project and adapter configuration separately. Although `ThemeProject` carries
`schemaVersion`, the 0.x line has not committed to a persistence format, compatibility window, or
migration API.

The product and repository are **UI Theme Builder** / `s9rg/ui-theme-builder`. The
headless engine remains `@s9rg/theme-compiler`; its package name describes the deterministic build
primitive rather than the visual product. Public APIs may evolve before 1.0.0.
See [RFC 0001](docs/RFC-0001-theme-model.md) and the
[workbench architecture](docs/DEMO_ARCHITECTURE.md) for the current contract and deferred scope. The
[research ledger](docs/RESEARCH.md) records the primary specifications and target-version decisions;
the [0.6.0 checklist](docs/RELEASE_CHECKLIST.md) records publication gates.

Chakra UI and Mantine remain deliberately deferred until the compiler has a versioned tonal-ramp
recipe rather than fabricating their ordered 11- and 10-shade component palettes. NativeWind v5 is
still documented upstream as prerelease, so the stable Tailwind v4 adapter and React Native Paper
adapter remain the honest web and native choices for 0.6.0.
