# `@s9rg/theme-adapter-shadcn`

Beta Theme Compiler adapter for shadcn v4 registry themes.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-compiler @s9rg/theme-adapter-shadcn
```

Install the generated registry item with the current shadcn CLI:

```sh
npx shadcn@^4 add ./src/generated/shadcn/theme.json
```

`shadcn` is a target and fixture dependency; the adapter does not load the CLI while it compiles a
theme.

## Generate

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createShadcnAdapter } from "@s9rg/theme-adapter-shadcn";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    accent: "#0f766e",
    white: "#ffffff",
    paper: "#f8faff",
    ink: "#13161f",
    night: "#07090f",
    divider: "#dbe3ef",
  },
  {
    id: "product",
    schemes: [
      {
        id: "light",
        roles: {
          primary: { ref: "palette.brand" },
          "primary-foreground": { ref: "palette.white" },
          secondary: { ref: "palette.accent" },
          "secondary-foreground": { ref: "palette.white" },
          background: { ref: "palette.paper" },
          surface: { ref: "palette.white" },
          foreground: { ref: "palette.ink" },
          divider: { ref: "palette.divider" },
        },
      },
      {
        id: "dark",
        roles: {
          primary: { ref: "palette.brand" },
          "primary-foreground": { ref: "palette.white" },
          background: { ref: "palette.night" },
          surface: { ref: "palette.ink" },
          foreground: { ref: "palette.white" },
          divider: { ref: "palette.divider" },
        },
      },
    ],
  },
);

const result = await compileTheme(project, [
  createShadcnAdapter({ itemName: "product-theme" }),
]);
if (!result.ok) {
  throw new Error(result.diagnostics.map(({ message }) => message).join("\n"));
}

for (const artifact of result.artifacts) {
  await mkdir(
    `src/generated/${artifact.path.split("/").slice(0, -1).join("/")}`,
    {
      recursive: true,
    },
  );
  await writeFile(`src/generated/${artifact.path}`, artifact.content, "utf8");
}
```

The adapter emits `shadcn/theme.json` plus the compiler-owned `theme.lock.json`. The JSON conforms to
the public `registry-item.json` shape with type `registry:theme` and `cssVars.light` / `cssVars.dark`.

The direct mappings include shadcn's background/foreground pairs, primary, secondary, muted, accent,
destructive, border, input, ring, chart, and sidebar tokens. Framework-neutral `surface` populates
both `card` and `popover`; `surface-foreground` takes precedence for their foregrounds, otherwise
the general `foreground` role is reused. `divider` maps to `border` and `sidebar-divider` maps to
`sidebar-border`.

Registry themes are deliberately partial. Missing semantic roles are omitted, so installing the
item leaves existing project variables unchanged instead of manufacturing destructive colors,
focus rings, chart palettes, or other meanings. The adapter reports this inheritance as an
informational diagnostic.

The adapter emits sRGB, HSL, and OKLCH in forms accepted by the pinned shadcn v4 CLI. Other color
spaces use their declared sRGB hex fallback and produce an informational diagnostic; compilation
fails closed when no fallback exists. This avoids shadcn's legacy-color rewrite producing invalid
CSS from otherwise valid CSS Color 4 syntax. `itemName` defaults to `generated-theme`; unsafe
registry names are normalized and reported.

The manifest ID is `shadcn@4`, its target range is `>=4 <5`, its engine API version is `1`, and its
current maturity is `beta`.

## License

MIT
