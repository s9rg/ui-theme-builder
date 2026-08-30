# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.6.0 - 2026-08-29

### Added

- Ant Design v6 adapter producing typed light/dark `ThemeConfig` exports at `antd/theme.ts`.
- shadcn v4 adapter producing a partial, schema-shaped `registry:theme` item at
  `shadcn/theme.json`.
- daisyUI v5 adapter producing documented Tailwind plugin theme blocks at `daisyui/theme.css`.
- Vuetify v4 adapter producing typed `ThemeDefinition` and provider options at
  `vuetify.theme.ts`.
- Angular Material v22 adapter producing Material 3 tonal maps, Sass mixins, and explicit system
  overrides at `angular-material.theme.scss`.
- Ionic v9 adapter producing one cross-framework variable theme for Ionic Core, React, Angular,
  and Vue at `ionic.theme.css`.
- React Native Paper v5 adapter producing typed MD3 light/dark themes at
  `react-native-paper/theme.ts`.
- Target fixtures for Ant Design, shadcn, daisyUI, Vuetify, Ionic, Angular Material AOT/Sass, and
  React Native Paper iOS/Android Metro bundles.

### Changed

- Expanded the GitHub Pages workbench from four to eleven selectable generators with target-specific
  descriptions, generated-file views, diagnostics, and explicit preview-fidelity labels.
- Loaded adapter implementations on demand so the larger catalog does not make every target part of
  the initial workbench JavaScript path.
- Bumped the compiler, adapters, Colorwheel input, and preview protocol packages to 0.6.0.

### Boundaries

- Chakra UI and Mantine remain deferred until a public, versioned tonal-ramp recipe can satisfy their
  ordered shade contracts without pretending that repeated seed colors are complete palettes.
- NativeWind v5 remains deferred while its Tailwind CSS v4 integration is prerelease; the stable
  Tailwind v4 and React Native Paper targets remain separate in this release.

## 0.5.0 - 2026-08-26

### Added

- Portable theme project model, compiler, diagnostics, limits, deterministic lockfile, and adapter ABI.
- DTCG 2025.10, CSS custom properties, Tailwind CSS v4, and Material UI v9 adapters.
- Colorwheel palette input adapter and runtime-validated demo preview protocol.
- GitHub Pages workbench with explicit light/dark semantic mapping and an exact MUI provider preview.
- Unit, adversarial boundary, packed-package, target-compiler, accessibility, and browser acceptance gates.

### Security

- Reject accessor-backed and unsupported runtime data boundaries, unsafe or colliding artifact paths,
  excessive output, hostile selectors/identifiers, stale asynchronous compilation, and unvalidated
  preview messages.

This is the first public 0.x release. Public APIs may evolve before 1.0.0 and will follow semantic
versioning within the 0.x line.
