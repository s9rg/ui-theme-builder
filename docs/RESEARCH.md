# Research ledger

Last reviewed: 2026-08-29

Theme Compiler implements target formats from public specifications and official framework
documentation. This ledger records the sources that define the 0.6.0 profiles and the deliberate
boundaries we chose. No framework source code, generated theme, design asset, or demo asset was copied
into this repository. Versioned source links are preferred where a public guide does not provide a
stable version selector.

## Canonical model

- [DTCG Format Module 2025.10](https://www.designtokens.org/TR/2025.10/format/) defines token files,
  aliases, groups, and the `application/design-tokens+json` media type.
- [DTCG Color Module 2025.10](https://www.designtokens.org/TR/2025.10/color/) defines structured color
  spaces, component ranges, alpha, and the six-digit hexadecimal fallback.
- [DTCG Resolver Module 2025.10](https://www.designtokens.org/TR/2025.10/resolver/) defines sets,
  modifiers, contexts, defaults, and resolution order.

The compiler uses a smaller authoring schema rather than claiming that `ThemeProject` is itself a DTCG
document. The DTCG adapter is the standards-shaped output boundary.

## Tailwind CSS v4

- [Tailwind theme variables](https://tailwindcss.com/docs/theme) defines top-level `@theme` variables,
  shareable theme files, and `@theme inline` aliases.

The adapter emits a shareable theme fragment. It deliberately does not add `@import "tailwindcss"`;
the consuming application owns its Tailwind entrypoint and source discovery.

## Material UI v9

- [MUI palette customization](https://mui.com/material-ui/customization/palette/) defines the standard
  palette groups and accepted color formats.
- [MUI CSS-variable configuration](https://mui.com/material-ui/customization/css-theme-variables/configuration/)
  defines `colorSchemes` and the data-attribute selector strategy used by the provider preview.
- [MUI supported versions](https://mui.com/material-ui/getting-started/supported-versions/) defines the
  current release/support policy.

The 0.6 profile emits only `light` and `dark`. A custom named scheme requires target-specific MUI
module augmentation and therefore fails closed instead of being silently dropped. Native wide-gamut
MUI colors are deferred; non-sRGB/HSL values require an explicit six-digit sRGB fallback.

## Ant Design v6

- [Ant Design theme customization](https://ant.design/docs/react/customize-theme/) defines
  `ThemeConfig`, seed/map/alias tokens, the default and dark algorithms, and CSS-variable mode.

The adapter emits typed light and dark configurations. It maps authored product roles only where Ant
has an equivalent token and lets Ant's documented algorithm derive its own state palette. In
particular, an arbitrary secondary color is not mislabeled as a success, information, or link color.

## shadcn registry themes

- [shadcn theming](https://ui.shadcn.com/docs/theming) defines the semantic CSS-variable vocabulary.
- [shadcn registry item JSON](https://ui.shadcn.com/docs/registry/registry-item-json) defines the
  `registry:theme` artifact consumed by the CLI.

The adapter emits a schema-valid partial registry theme. Roles absent from the authored project stay
absent; it does not invent destructive, chart, sidebar, or focus-ring semantics.

## daisyUI v5

- [daisyUI color roles](https://daisyui.com/docs/colors/) defines base, content, brand, and status
  variables.
- [daisyUI themes](https://daisyui.com/docs/themes/) defines `@plugin "daisyui/theme"` and partial
  built-in-theme overrides.

The adapter extends the documented light and dark themes with exact authored roles. Unauthored status
and component-state colors intentionally inherit from daisyUI and are reported by a diagnostic.

## Vuetify v4

- [Vuetify v4.1.12 theme source and `ThemeDefinition`](https://github.com/vuetifyjs/vuetify/blob/v4.1.12/packages/vuetify/src/composables/theme.ts)
  define provider themes, colors, variables, and light/dark behavior.

Vuetify accepts direct semantic colors, so the adapter requires no tonal synthesis. Missing target
status colors remain Vuetify defaults.

## Angular Material v22

- [Angular Material v22.1.4 theming guide](https://github.com/angular/components/blob/v22.1.4/guides/theming.md)
  defines `mat.theme`, Material 3 palettes, system overrides, and selector-scoped schemes.
- [Angular Material v22.1.4 theme-color schematic](https://github.com/angular/components/blob/v22.1.4/src/material/schematics/ng-generate/theme-color/README.md)
  documents official Material Color Utilities palette generation.
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) is the
  official open-source algorithm implementation pinned and bundled by the adapter.

The adapter uses the official Material Color Utilities algorithm to expand authored seeds into the
tonal maps Angular Material actually requires, then preserves explicit authored semantic roles through
system overrides. This derivation is target-specific and reported; a stock-palette overlay would leave
unrelated hover, container, and state colors and is deliberately not emitted.

## Ionic v9

- [Ionic colors](https://ionicframework.com/docs/theming/colors) defines base, RGB, contrast, shade,
  and tint variables.
- [Ionic application themes](https://ionicframework.com/docs/theming/themes) and
  [dark mode](https://ionicframework.com/docs/theming/dark-mode) define application and stepped colors
  plus the `.ion-palette-dark` selector.

One generated CSS artifact works with Ionic Core, React, Angular, and Vue. Shade, tint, and stepped
colors use Ionic's documented mechanical mixes. Explicit foreground roles win for contrast; a
black/white fallback is always diagnosed.

## React Native Paper v5

- [React Native Paper theming](https://github.com/callstack/react-native-paper/blob/v5.15.3/docs/docs/guides/02-theming.mdx)
  defines `MD3Theme` and provider usage.
- [Paper's MD3 light base](https://github.com/callstack/react-native-paper/blob/v5.15.3/src/styles/themes/v3/LightTheme.tsx)
  defines the default theme extended by generated overrides.

The adapter exports typed light and dark MD3 themes that spread Paper's defaults and replace only
authored roles. Inherited target roles are named in diagnostics instead of being presented as derived
from the input palette.

## Accessibility evidence

- [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) defines
  the 4.5:1 ratio used for the workbench's explicitly paired text diagnostics.

Those checks apply only to the four foreground/background pairs shown in the workbench. They are not a
claim that an unordered palette or generated theme is globally accessible. Automated browser checks
cover the static workbench structure; manual assistive-technology and target-provider reviews remain
separate release evidence.

## Deferred targets

Research also covered Chakra UI, Mantine, Quasar, Element Plus, NG-ZORRO, Ant Design Vue, NativeWind,
Tamagui, Restyle, Radix Themes, Bootstrap, and Fluent UI.

- [Chakra's color customization guide](https://chakra-ui.com/docs/theming/customization/colors)
  recommends a `50`–`950` palette and matching semantic color-palette tokens. That is eleven ordered
  shades plus component semantics, not one flat seed.
- [Mantine's color guide](https://mantine.dev/theming/colors/) requires at least ten ordered shades for
  a normal custom component color and warns that incomplete tuples leave variants without proper
  colors.
- [NativeWind v5's official Tailwind guide](https://www.nativewind.dev/v5/core-concepts/tailwindcss)
  identifies the v5/Tailwind v4 line as prerelease and not intended for production use.

Chakra and Mantine are therefore deferred until the public model has an explicit, reviewable tonal-ramp
recipe. Repeating a seed or inventing undocumented shades would satisfy a TypeScript shape without
satisfying the component contract. NativeWind's stable line and its prerelease Tailwind v4 line would
require different profiles, so neither is mislabeled as equivalent to the existing web Tailwind v4
adapter. Each future adapter still needs a versioned profile and a real consumer fixture; popularity
alone is not sufficient.
