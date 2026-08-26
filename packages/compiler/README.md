# `@s9rg/theme-compiler`

Portable theme project model, runtime validation, deterministic compiler, and adapter ABI.

> 0.5.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-compiler
```

Install at least one target adapter to generate framework files.

## Usage

```ts
import { createCssAdapter } from "@s9rg/theme-adapter-css";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    canvas: "#f8faff",
    text: "#13161f",
  },
  {
    id: "product-theme",
    schemes: [
      {
        id: "light",
        roles: {
          primary: { ref: "palette.brand" },
          background: { ref: "palette.canvas" },
          foreground: { ref: "palette.text" },
        },
      },
    ],
  },
);

const result = await compileTheme(project, [createCssAdapter()]);

if (result.ok) {
  // Includes adapter output and theme.lock.json verification evidence.
  for (const artifact of result.artifacts) {
    console.log(artifact.path, artifact.content);
  }
} else {
  console.error(result.diagnostics);
}
```

`createThemeProject` accepts a color array or named record. Array entries receive positional primitive
IDs, but no semantic meaning. Named entries are normalized under `palette.*`; colliding names are
rejected. Schemes and their role-to-primitive references are always explicit.

String colors are limited to `#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA`. Use `StructuredColor` for a
supported DTCG color space. The compiler does not parse arbitrary CSS color strings.

## Compiler contract

`compileTheme(project, adapters, options?)`:

- validates and snapshots inert input data;
- resolves references into an immutable `ThemeGraph`;
- checks each manifest's `engineApiVersion`, maturity, target, color/scheme/role capabilities, and public
  option schema;
- supports synchronous or asynchronous adapters and an optional `AbortSignal`;
- validates diagnostics, JSON previews, file paths, collisions, and configured count/byte limits;
- returns virtual artifacts and appends `theme.lock.json` only on success.

Adapters execute as caller-provided JavaScript. The compiler validates their data boundaries but does
not sandbox their code.

`theme.lock.json` records a project hash, adapter identities, and artifact hashes. It cannot reconstruct
the authored colors, role bindings, diagnostics, or preview data. Normalized factory configuration
(which must be non-secret) is stored inline, but it is not the final project-derived configuration or a
substitute for the authored options; artifact hashes bind the effective output. Keep `ThemeProject` and
adapter configuration as source. The alpha schema version is a validation boundary; persistence
compatibility and migration APIs are not committed yet.

The supported Node runtime floor is 20.19. Compilation needs `WebCrypto.SubtleCrypto` and `TextEncoder`;
modern browser bundles can provide the same host APIs. The repository's development range is narrower
on some Node majors because Vite and ESLint have their own engine requirements.

## License

MIT
