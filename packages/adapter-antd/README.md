# `@s9rg/theme-adapter-antd`

Beta Theme Compiler adapter for Ant Design v6 theme configurations.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install \
  @s9rg/theme-compiler \
  @s9rg/theme-adapter-antd \
  antd@^6 \
  react \
  react-dom
```

`antd` is required by the generated file, not by the adapter while it compiles a theme.

## Generate

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createAntdAdapter } from "@s9rg/theme-adapter-antd";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    white: "#ffffff",
    paper: "#f8faff",
    ink: "#13161f",
    night: "#07090f",
  },
  {
    id: "product",
    schemes: [
      {
        id: "light",
        roles: {
          primary: { ref: "palette.brand" },
          "primary-foreground": { ref: "palette.white" },
          background: { ref: "palette.paper" },
          surface: { ref: "palette.white" },
          foreground: { ref: "palette.ink" },
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
        },
      },
    ],
  },
);

const result = await compileTheme(project, [
  createAntdAdapter({ exportName: "productThemes" }),
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

The adapter emits `antd/theme.ts` plus the compiler-owned `theme.lock.json`. The module exports a
typed light/dark map. It names Ant Design's `defaultAlgorithm` and `darkAlgorithm` explicitly, so
Ant Design remains responsible for deriving its documented token ramps.

## Consume

```tsx
import { ConfigProvider } from "antd";
import { productThemes } from "./generated/antd/theme";

export function Provider({ dark, children }) {
  return (
    <ConfigProvider theme={productThemes[dark ? "dark" : "light"]}>
      {children}
    </ConfigProvider>
  );
}
```

The adapter uses only semantically compatible mappings:

- `primary` becomes `colorPrimary`;
- `primary-foreground` becomes `colorTextLightSolid`;
- `background` becomes `colorBgBase` and `colorBgLayout`;
- `surface` becomes `colorBgContainer` and `colorBgElevated`;
- `foreground` becomes `colorTextBase` and `colorText`;
- `muted-foreground` becomes `colorTextSecondary`;
- `divider` becomes `colorBorder` and `colorSplit`;
- explicit `link`, `error`, `warning`, `info`, and `success` roles become their same-purpose Ant
  Design seed tokens.

Ant Design has no generic secondary brand token. `secondary` is therefore skipped with a diagnostic
instead of being mislabeled as an information, success, or link color. Unbound Ant Design tokens
keep their framework defaults.

Ant Design receives sRGB or HSL values. A color in another structured space requires a six-digit
sRGB hex fallback. Otherwise `compileTheme` rejects the incompatible project. `exportName` defaults
to `themes`; unsafe TypeScript identifiers are normalized and reported.

The manifest ID is `antd@6`, its target range is `>=6 <7`, its engine API version is `1`, and its
current maturity is `beta`.

## License

MIT
