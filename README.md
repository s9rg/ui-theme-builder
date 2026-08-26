# UI Theme Builder

UI Theme Builder turns a Colorwheel palette into previewable, downloadable theme files for popular
UI libraries and CSS formats. Its headless Theme Compiler engine keeps color primitives, semantic
bindings, diagnostics, and generated artifacts deterministic.

Version 0.5.0 is the first public 0.x release. It includes DTCG 2025.10, CSS custom properties,
Tailwind CSS v4, and Material UI v9 adapters plus a React/Vite workbench built with
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

See [Generate and consume themes](docs/GENERATE_AND_CONSUME.md) for an end-to-end example covering all
four adapters and their target runtimes.

## Packages

- `@s9rg/theme-compiler` — project model, validation, compiler, and adapter ABI.
- `@s9rg/theme-adapter-dtcg` — DTCG 2025.10 format and resolver documents.
- `@s9rg/theme-adapter-css` — framework-neutral CSS custom properties.
- `@s9rg/theme-adapter-tailwind` — Tailwind CSS v4 `@theme` output.
- `@s9rg/theme-adapter-mui` — Material UI v9 `createTheme` options.
- `@s9rg/theme-input-colorwheel` — explicit Colorwheel palette-to-project conversion.
- `@s9rg/theme-demo-protocol` — runtime-validated preview message data.

Target frameworks are not compiler runtime dependencies. The Material UI runtime is installed only in
the demo so that its provider preview can use real components.

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
the [0.5.0 checklist](docs/RELEASE_CHECKLIST.md) records publication gates.
