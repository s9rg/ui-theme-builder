# `@s9rg/theme-adapter-css`

Beta Theme Compiler adapter for framework-neutral CSS custom properties.

> 0.5.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-compiler @s9rg/theme-adapter-css
```

## Generate

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createCssAdapter } from "@s9rg/theme-adapter-css";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    white: "#ffffff",
    ink: "#13161f",
    night: "#07090f",
  },
  {
    id: "product",
    schemes: [
      {
        id: "light",
        roles: {
          background: { ref: "palette.white" },
          foreground: { ref: "palette.ink" },
          primary: { ref: "palette.brand" },
          "primary-foreground": { ref: "palette.white" },
        },
      },
      {
        id: "dark",
        roles: {
          background: { ref: "palette.night" },
          foreground: { ref: "palette.white" },
          primary: { ref: "palette.brand" },
          "primary-foreground": { ref: "palette.white" },
        },
      },
    ],
  },
);

const result = await compileTheme(project, [
  createCssAdapter({
    prefix: "product",
    darkSelector: '[data-color-scheme="dark"]',
  }),
]);
if (!result.ok) {
  throw new Error(result.diagnostics.map(({ message }) => message).join("\n"));
}

await mkdir("src/generated", { recursive: true });
for (const artifact of result.artifacts) {
  await writeFile(`src/generated/${artifact.path}`, artifact.content, "utf8");
}
```

The adapter emits `theme.css` plus the compiler-owned `theme.lock.json`. Primitive variables and the
light scheme (or first scheme) are written to `:root`; dark roles use the configured selector;
additional schemes use deterministic `[data-theme="<scheme>"]` selectors.

## Consume

```js
import "./generated/theme.css";

document.documentElement.dataset.colorScheme = "dark";
```

```css
.button {
  color: var(--product-semantic-primary-foreground);
  background: var(--product-semantic-primary);
}
```

Primitive variables use `--product-palette-<id>` and semantic variables use
`--product-semantic-<role>`. `prefix` defaults to `theme`. `darkSelector` defaults to
`[data-theme="dark"]` and accepts only a simple class or quoted data-attribute selector. Unsafe values,
including selectors that collide with a generated non-dark scheme selector, fall back to the safe
default and produce diagnostics.

The manifest ID is `css@1`, its engine API version is `1`, and its current maturity is `beta`. The
adapter has no CSS framework runtime dependency.

## License

MIT
