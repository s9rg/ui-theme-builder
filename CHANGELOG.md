# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
