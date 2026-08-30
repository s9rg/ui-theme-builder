# `@s9rg/theme-input-colorwheel`

Converts public `Palette` and `PaletteDocument` values from `@s9rg/colorwheel` into Theme Compiler
projects.

> 0.6.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/colorwheel@^1.0.1 @s9rg/theme-compiler @s9rg/theme-input-colorwheel
```

## Usage

```ts
import { colorwheelPaletteToThemeProject } from "@s9rg/theme-input-colorwheel";

const project = colorwheelPaletteToThemeProject(palette, {
  id: "brand",
  schemes: [
    {
      id: "light",
      roles: {
        primary: "brand-purple",
        background: "paper",
        foreground: "ink",
      },
    },
  ],
});
```

Scheme mappings refer to Colorwheel color IDs. The adapter allocates deterministic, safe
`palette.<id>` primitive IDs, preserves palette names as primitive labels, and rejects duplicate IDs or
references to missing colors.

Semantic meaning is never inferred. Omit `schemes` to create primitives only, or provide every role
binding needed by the selected target adapter.

For this release, Colorwheel values are deliberately converted and gamut-mapped to portable sRGB before
the project is created. This avoids target-specific clipping differences but does not preserve the
original wide-gamut space.

## License

MIT
