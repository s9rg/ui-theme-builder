# Research ledger

Last reviewed: 2026-08-26

Theme Compiler implements target formats from public specifications and official framework
documentation. This ledger records the sources that define the current alpha profiles and the
deliberate boundaries we chose. No framework source code, generated theme, design asset, or demo asset
was copied into this repository.

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

The alpha profile emits only `light` and `dark`. A custom named scheme requires target-specific MUI
module augmentation and therefore fails closed instead of being silently dropped. Native wide-gamut
MUI colors are deferred; non-sRGB/HSL values require an explicit six-digit sRGB fallback.

## Accessibility evidence

- [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) defines
  the 4.5:1 ratio used for the workbench's explicitly paired text diagnostics.

Those checks apply only to the four foreground/background pairs shown in the workbench. They are not a
claim that an unordered palette or generated theme is globally accessible. Automated browser checks
cover the static workbench structure; manual assistive-technology and target-provider reviews remain
separate release evidence.

## Deferred targets

Research also covered Chakra UI, Angular Material, Vuetify, Quasar, Element Plus, Ant Design,
NG-ZORRO, Ionic, React Native Paper, NativeWind, Tamagui, Restyle, shadcn, Mantine, Radix Themes,
Bootstrap, Fluent UI, and daisyUI. They are not part of this alpha. Each future adapter needs its own
versioned target profile and packed consumer fixture; framework popularity alone is not enough to add
it to the supported matrix.
