# `@s9rg/theme-adapter-daisyui`

Beta Theme Compiler adapter for daisyUI v5 themes on Tailwind CSS v4.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install \
  @s9rg/theme-compiler \
  @s9rg/theme-adapter-daisyui \
  tailwindcss@^4 \
  daisyui@^5
```

Tailwind CSS and daisyUI are required by the generated stylesheet, not by the adapter while it
compiles a theme.

## Generate

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createDaisyUiAdapter } from "@s9rg/theme-adapter-daisyui";
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

const result = await compileTheme(project, [createDaisyUiAdapter()]);
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

Use `daisyui/theme.css` as a Tailwind CSS entry file, or copy its plugin blocks into an existing
entry. It imports Tailwind, enables the built-in light and dark themes, then applies generated
overrides through the documented `daisyui/theme` plugin.

Framework-neutral roles map to daisyUI as follows:

- `surface`, `background`, and `divider` become `base-100`, `base-200`, and `base-300`;
- `foreground` becomes `base-content`;
- primary, secondary, accent, neutral, info, success, warning, and error roles map to their exact
  daisyUI colors;
- each matching `-foreground` role becomes the target's `-content` color.

The generated blocks intentionally override daisyUI's built-in `light` and `dark` themes. Unbound
colors therefore inherit documented target defaults. `muted-foreground` is not assigned to an
unrelated semantic slot because daisyUI represents muted content with `base-content` opacity.
Both behaviors are reported in diagnostics instead of hidden.

Structured colors are emitted as CSS Color values without reducing their gamut. Schemes other than
`light` and `dark`, and roles without a same-purpose daisyUI token, are rejected or skipped with
diagnostics.

The manifest ID is `daisyui@5`, its target range is `>=5 <6`, its engine API version is `1`, and its
current maturity is `beta`.

## License

MIT
