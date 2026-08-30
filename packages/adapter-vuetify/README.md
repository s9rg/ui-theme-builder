# `@s9rg/theme-adapter-vuetify`

Beta Theme Compiler adapter for Vuetify v4 theme definitions.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-compiler @s9rg/theme-adapter-vuetify vuetify@^4 vue
```

Vuetify is required by the generated TypeScript file, not by the adapter at compile time.

## Generate

```js
import { createVuetifyAdapter } from "@s9rg/theme-adapter-vuetify";
import { compileTheme } from "@s9rg/theme-compiler";

const result = await compileTheme(project, [
  createVuetifyAdapter({ exportName: "productTheme" }),
]);
```

The adapter emits `vuetify.theme.ts` plus `theme.lock.json`. The generated module exports exact
Vuetify `ThemeDefinition` objects for authored light and dark schemes and a `VuetifyOptions`
theme object suitable for `createVuetify({ theme: productTheme })`.

Every scheme must bind `primary`. Optional mappings include `primary-foreground`, `secondary`,
`secondary-foreground`, `background`, `surface`, `foreground`, `muted-foreground`, `divider`, and
Vuetify's status colors. Missing target colors inherit Vuetify defaults; unknown roles are skipped
with diagnostics. `divider` supplies Vuetify's RGB-channel `border-color` and `border-opacity`
variables used by component borders; Vuetify's `VDivider` component itself inherits `currentColor`.
Translucent theme colors are rejected because Vuetify components append their own opacity to color
channels; divider alpha is the exception because it has a dedicated `border-opacity` variable. No
tonal ramp or semantic role is invented.

The manifest ID is `vuetify@4`, its target range is `>=4 <5`, its engine API version is `1`, and
its current maturity is `beta`.

## Consume

```ts
import { createVuetify } from "vuetify";
import productTheme from "./generated/vuetify.theme";

export const vuetify = createVuetify({ theme: productTheme });
```

## License

MIT
