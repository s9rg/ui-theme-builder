# `@s9rg/theme-adapter-ionic`

Beta Theme Compiler adapter for Ionic v9 CSS themes. The generated artifact is shared by Ionic
Core, Angular, React, and Vue applications.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-compiler @s9rg/theme-adapter-ionic @ionic/core@^9
```

Use the Ionic wrapper appropriate to the application (`@ionic/angular`, `@ionic/react`, or
`@ionic/vue`) instead of `@ionic/core` when applicable.

## Generate and consume

```js
import { createIonicAdapter } from "@s9rg/theme-adapter-ionic";
import { compileTheme } from "@s9rg/theme-compiler";

const result = await compileTheme(project, [createIonicAdapter()]);
```

Write `ionic.theme.css` into the application and import it after Ionic's core styles. Add
`ion-palette-dark` to the `html` element to activate the authored dark scheme. A different safe
class or data-attribute selector can be configured with `darkSelector`.

The adapter emits Ionic's complete layered-color contract: base, RGB, contrast, contrast RGB,
shade, and tint. Explicit foreground roles supply contrast colors. When omitted, the adapter uses
Ionic's documented black/white contrast choice. Shade is a 12% black mix, tint is a 10% white mix,
and application stepped colors are background/text mixes in 5% increments. Every derivation is
reported; no status role is inferred.

The manifest ID is `ionic@9`, its target range is `>=9 <10`, its engine API version is `1`, and its
current maturity is `beta`.

## License

MIT
