# `@s9rg/theme-adapter-react-native-paper`

Beta Theme Compiler adapter for React Native Paper v5 Material Design 3 themes.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install \
  @s9rg/theme-compiler \
  @s9rg/theme-adapter-react-native-paper \
  react-native-paper@^5 \
  react \
  react-native \
  react-native-safe-area-context
```

`react-native-paper` is required by the generated theme module, not by the adapter at compile time.

## Generate

```js
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createReactNativePaperAdapter } from "@s9rg/theme-adapter-react-native-paper";
import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";

const project = createThemeProject(
  {
    brand: "#6f56f3",
    accent: "#0f766e",
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
          secondary: { ref: "palette.accent" },
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
          secondary: { ref: "palette.accent" },
          background: { ref: "palette.night" },
          surface: { ref: "palette.ink" },
          foreground: { ref: "palette.white" },
        },
      },
    ],
  },
);

const result = await compileTheme(project, [createReactNativePaperAdapter()]);
if (!result.ok) {
  throw new Error(result.diagnostics.map(({ message }) => message).join("\n"));
}

for (const artifact of result.artifacts) {
  const destination = join("src/generated", artifact.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, artifact.content, "utf8");
}
```

The adapter emits `react-native-paper/theme.ts` plus the compiler-owned `theme.lock.json`. The module
exports `lightTheme`, `darkTheme`, and `paperThemes`, and defaults to `lightTheme`.

## Consume

```tsx
import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { paperThemes } from "./generated/react-native-paper/theme";

export function App({ children }) {
  const scheme = useColorScheme();
  return (
    <PaperProvider
      theme={scheme === "dark" ? paperThemes.dark : paperThemes.light}
    >
      {children}
    </PaperProvider>
  );
}
```

The generated themes spread `MD3LightTheme` and `MD3DarkTheme`, then apply only authored semantic
roles. Generic roles map as follows:

- `primary-foreground`, `secondary-foreground`, `tertiary-foreground`, and `error-foreground` map to
  the corresponding MD3 `on*` colors.
- `foreground` maps to both `onBackground` and `onSurface`.
- `muted-foreground` maps to `onSurfaceVariant`.
- `divider` maps to `outlineVariant`, which is the token used by Paper's
  `Divider`; an explicit `outline-variant` role takes precedence.

Target-specific roles such as `primary-container`, `on-primary-container`, `surface-variant`,
`outline-variant`, `inverse-primary`, and `elevation-level-0` through `elevation-level-5` are also
supported. When both a target-specific role such as `on-primary` and its generic alias are present,
the target-specific role wins and the adapter reports the collision.

The adapter never invents a Material tonal palette. Every omitted MD3 color stays on the selected
React Native Paper default, and diagnostics list those inherited values. Author the remaining roles
explicitly when a fully brand-coherent MD3 scheme is required.

React Native Paper receives portable sRGB or HSL strings. A color in another structured space needs
a six-digit sRGB hex fallback; otherwise compilation fails closed.

The manifest ID is `react-native-paper@5`, its target range is `>=5 <6`, its engine API version is
`1`, and its current maturity is `beta`.

## License

MIT
