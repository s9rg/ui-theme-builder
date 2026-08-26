# Contributing

Theme Compiler is in an early contract-design phase. Please open an issue before adding a target adapter
or generation recipe so its target profile, licensing, capability surface, and fixture strategy can be
reviewed first.

## Local checks

Use Node.js 20.19.x, 22.13 or newer, or 24 or newer. The workspace range follows the strictest
development dependency, not a syntax requirement imposed by every published package.

```sh
npm ci
npm run check
```

To work on the browser demo from a fresh clone:

```sh
npm ci
npm run dev
```

Vite and Vitest resolve workspace packages to `packages/*/src/index.ts`, so a package build is not
required before starting the dev server or unit suite, and edits to package source remain visible during
development.

Adapters must be deterministic, browser-safe, and backed by a clean consumer fixture using the real
target package. Do not add target frameworks as compiler runtime dependencies.
