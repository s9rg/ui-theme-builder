# `@s9rg/theme-adapter-angular-material`

Beta Theme Compiler adapter for Angular Material v22 Material 3 themes.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install \
  @s9rg/theme-compiler \
  @s9rg/theme-adapter-angular-material \
  @angular/material@^22
```

The adapter bundles its pinned `@material/material-color-utilities@0.4.0` implementation so its
Node API works without relying on that release's bundler-only ESM internals. Angular Material
itself is required only when compiling the generated Sass file.

## Generate

```js
import { createAngularMaterialAdapter } from "@s9rg/theme-adapter-angular-material";
import { compileTheme } from "@s9rg/theme-compiler";

const result = await compileTheme(project, [
  createAngularMaterialAdapter({ darkSelector: ".theme-dark" }),
]);
```

The adapter emits `angular-material.theme.scss` plus `theme.lock.json`. Import the generated Sass
file once in the application's global styles.

Every scheme must bind `primary`. The adapter expands primary and optional secondary, tertiary,
neutral, neutral-variant, and error seeds into the exact tonal-map shape expected by Angular
Material's `mat.theme` mixin. Expansion uses Material Color Utilities 0.4.0, matching Angular
Material v22's official `theme-color` schematic. Missing seed families use the same documented
Material fidelity derivations and are reported.

Explicit semantic roles are subsequently passed through `mat.theme-overrides`: primary,
on-primary, secondary, on-secondary, tertiary, on-tertiary, error, on-error, background, surface,
on-background, on-surface, on-surface-variant, and outline-variant. The adapter does not disguise a
stock palette as a generated theme and does not infer status semantics.

The manifest ID is `angular-material@22`, its target range is `>=22 <23`, its engine API version is
`1`, and its current maturity is `beta`.

## License

MIT. The bundled Material Color Utilities implementation is Apache-2.0 licensed; its license is
included in `MATERIAL_COLOR_UTILITIES_LICENSE`.
