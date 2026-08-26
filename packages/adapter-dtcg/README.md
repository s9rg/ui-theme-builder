# `@s9rg/theme-adapter-dtcg`

Beta Theme Compiler adapter for DTCG 2025.10 format and resolver documents.

> 0.5.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-compiler @s9rg/theme-adapter-dtcg
```

## Generate

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createDtcgAdapter } from "@s9rg/theme-adapter-dtcg";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  { brand: "#6f56f3", ink: "#13161f" },
  {
    id: "brand",
    schemes: [
      {
        id: "light",
        roles: {
          primary: { ref: "palette.brand" },
          foreground: { ref: "palette.ink" },
        },
      },
    ],
  },
);

const result = await compileTheme(project, [
  createDtcgAdapter({ filePrefix: "brand" }),
]);
if (!result.ok) {
  throw new Error(result.diagnostics.map(({ message }) => message).join("\n"));
}

await mkdir("src/generated", { recursive: true });
for (const artifact of result.artifacts) {
  await writeFile(`src/generated/${artifact.path}`, artifact.content, "utf8");
}
```

This emits:

- `brand.primitives.tokens.json` with structured color primitives;
- one `brand.<scheme>.tokens.json` file per semantic scheme;
- `brand.resolver.json` linking the primitive and scheme documents;
- the compiler-owned `theme.lock.json` verification record.

Token documents use `application/design-tokens+json`; the resolver uses `application/json`. Multiple
schemes become resolver modifier contexts. With one scheme, the resolver uses a single token set. With
no schemes, it still emits the primitive document and resolver and reports a diagnostic.

## Consume

Configure a DTCG 2025.10 resolver-aware tool with `src/generated/brand.resolver.json` as its entrypoint.
A direct JSON import exposes the unresolved document, including aliases that the resolver must follow:

```js
import light from "./generated/brand.light.tokens.json" with { type: "json" };

console.log(light.color.semantic.primary.$value);
// {color.palette.brand}
```

`filePrefix` defaults to `theme`. Unsafe characters are normalized deterministically and reported.
The manifest ID is `dtcg@2025.10`, its engine API version is `1`, and its current maturity is `beta`.

## License

MIT
