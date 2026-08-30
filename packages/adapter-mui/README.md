# `@s9rg/theme-adapter-mui`

Beta Theme Compiler adapter for Material UI v9 color-scheme options.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install \
  @s9rg/theme-compiler \
  @s9rg/theme-adapter-mui \
  @mui/material@^9 \
  @emotion/react \
  @emotion/styled \
  react \
  react-dom
```

`@mui/material` is required by the generated file, not by the adapter at compile time.

## Generate

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createMuiAdapter } from "@s9rg/theme-adapter-mui";
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
  createMuiAdapter({ exportName: "productTheme" }),
]);
if (!result.ok) {
  throw new Error(result.diagnostics.map(({ message }) => message).join("\n"));
}

await mkdir("src/generated", { recursive: true });
for (const artifact of result.artifacts) {
  await writeFile(`src/generated/${artifact.path}`, artifact.content, "utf8");
}
```

The adapter emits `theme.ts` plus `theme.lock.json`. `theme.ts` imports `createTheme`, passes
`cssVariables` and light/dark `colorSchemes`, and exports the configured theme name and a default.

## Consume

```tsx
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import productTheme from "./generated/theme";

export function App() {
  return (
    <ThemeProvider theme={productTheme} defaultMode="dark" noSsr>
      <CssBaseline />
      <Button variant="contained">Save</Button>
    </ThemeProvider>
  );
}
```

Every compiled scheme must bind `primary`. Recognized optional roles are `primary-foreground`,
`secondary`, `secondary-foreground`, `error`, `error-foreground`, `warning`, `warning-foreground`,
`info`, `info-foreground`, `success`, `success-foreground`, `background`, `surface`, `foreground`,
`muted-foreground`, and `divider`. Schemes other than `light` and `dark` and unknown roles are skipped
with diagnostics.

MUI receives strict hex/sRGB/HSL values. A referenced color in another structured space requires a
six-digit sRGB hex fallback; otherwise `compileTheme` rejects the incompatible project before
generation. `exportName` defaults to `theme`; invalid TypeScript identifiers are normalized and
reported.

The manifest ID is `mui@9`, its target range is `>=9 <10`, its engine API version is `1`, and its
current maturity is `beta`.

## License

MIT
