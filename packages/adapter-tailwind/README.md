# `@s9rg/theme-adapter-tailwind`

Beta Theme Compiler adapter for Tailwind CSS v4's CSS-first theme variables.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-compiler @s9rg/theme-adapter-tailwind
npm install --save-dev tailwindcss @tailwindcss/cli
```

## Generate

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createTailwindAdapter } from "@s9rg/theme-adapter-tailwind";
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
  createTailwindAdapter({
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

The adapter emits `theme.tailwind.css` plus `theme.lock.json`. The theme file contains an `@theme`
palette, scheme-specific semantic backing variables, and `@theme inline` aliases.

## Consume

Import the generated file in the application's Tailwind input CSS:

```css
@import "tailwindcss";
@import "./generated/theme.tailwind.css";
```

```sh
npx @tailwindcss/cli -i ./src/app.css -o ./dist/app.css
```

Use the semantic roles as normal color utilities:

```html
<html data-color-scheme="dark">
  <body class="bg-background text-foreground">
    <button class="bg-primary text-primary-foreground">Save</button>
  </body>
</html>
```

`prefix` namespaces semantic backing variables and defaults to `theme`. `darkSelector` defaults to
`[data-theme="dark"]` and accepts only a simple class or quoted data-attribute selector. Unsafe values,
including selectors that collide with a generated non-dark scheme selector, fall back to the safe
default and produce diagnostics.

The manifest ID is `tailwind@4`, its target range is `>=4 <5`, its engine API version is `1`, and its
current maturity is `beta`. Tailwind itself is not a runtime dependency of the adapter package.

## License

MIT
