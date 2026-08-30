# GitHub Pages workbench architecture

The workbench is both the public demo and an acceptance surface for generated output. This document
separates the implemented 0.6.0 application from the planned multi-frame architecture.

## Implemented 0.6.0 workbench

The current workbench is one React/Vite application. It:

1. edits a palette with the public `@s9rg/colorwheel` React API;
2. optionally customizes the explicit starter light and dark semantic-role mappings;
3. selects one of eleven targets: DTCG 2025.10, CSS, Tailwind CSS v4, Material UI v9, Ant Design v6,
   shadcn v4, daisyUI v5, Vuetify v4, Angular Material v22, Ionic v9, or React Native Paper v5;
4. compiles the selected adapter asynchronously and cancels stale work;
5. applies the selected theme to the workbench shell, using a validated semantic model or, for MUI,
   the adapter's JSON model through real MUI components and `ThemeProvider`;
6. displays generated code and compiler/contrast diagnostics;
7. copies or downloads individual files and exports every artifact plus `theme.lock.json` as one ZIP.

The application does not evaluate generated source. Preview models are JSON-only data derived during
the same adapter compile that produces the downloadable artifact. Exact framework consumption remains
the responsibility of the target provider or build fixture described below.

## Preview fidelity

Protocol version 1 defines these exact fidelity names:

- `exact-runtime` — a real target runtime consumes adapter preview data derived from the same target
  model as the artifact;
- `exact-css-variables` — the preview applies the same resolved semantic color values through CSS
  custom properties without evaluating downloadable CSS;
- `mapped-preview` — a neutral or real component fixture consumes a mapped semantic payload while the
  artifact still requires its target build step;
- `native-web-approximation` — a web fixture approximates a non-web target;
- `compile-verified` — the artifact is compile-checked but has no interactive runtime preview.

The current declarations are:

- MUI: `exact-runtime`; the real provider consumes options derived from the same target model as
  `theme.ts`.
- CSS: `exact-css-variables`; the shell receives the exact resolved values without evaluating the
  downloadable stylesheet.
- DTCG, Tailwind, Ant Design, shadcn, daisyUI, Vuetify, and Ionic: `mapped-preview`; the shell renders
  the adapter's mapped semantic payload, not target components.
- Angular Material: `compile-verified`; the generated Sass is exercised by a real Angular Material
  Sass and AOT fixture, but the browser demo does not embed Angular.
- React Native Paper: `native-web-approximation`; the browser shell approximates the native product
  composition, while separate iOS and Android Metro bundle fixtures verify the generated module.

Selecting a framework changes the workbench's themed product shell and the artifact/diagnostic view;
there is no second miniature preview window. The fidelity label remains visible precisely because a
cohesive product preview can otherwise look more exact than its underlying evidence.

## Implemented protocol v1

`@s9rg/theme-demo-protocol` validates plain-object messages with protocol identifier
`@s9rg/theme-preview` and version `1`. It currently defines:

- `theme.update` with a request ID, target, light/dark profile, fidelity, and nine strict hexadecimal
  semantic colors;
- `preview.ready` with a preview ID;
- `preview.error` with a request ID and bounded error payload.

Unknown fields and unsupported enum values are rejected. In the current single-document app,
`theme.update` is constructed and validated in-process before rendering. There is no `postMessage`
transport in the implemented 0.6.0 workbench.

## Planned isolated previews

Framework-specific preview applications may later be built as separate static documents, for example:

```text
/
/preview/css/
/preview/react/
/preview/vue/
/preview/angular/
/preview/native/
```

That phase must extend the protocol before any iframe transport ships. The planned extension includes a
session nonce, parent/child origin and window validation, an input hash, stale-request handling, and a
`rendered` acknowledgement. Those fields and message type are future work; protocol v1 does not claim
to provide them.

Provider runtimes and global styles should remain isolated by document. Generated source must still
remain data: preview children consume validated JSON models, never `eval`, dynamic imports, or injected
scripts.

## Persistence and sharing

The implemented workbench keeps state in React memory for the current page session and offers
individual artifact downloads plus an output ZIP. The ZIP is compiled output, not an editable project
backup.
Versioned local persistence, URL-fragment sharing, and full `.theme.json` project downloads are planned
but not implemented. `ThemeProject.schemaVersion` exists for compiler boundary validation, but no
persistence compatibility window or migration API is committed yet.

## Deployment

Vite defaults to the repository base `/ui-theme-builder/`. CI builds the package set and the Pages
candidate. After successful CI on `main`, the Pages workflow checks out the exact successful commit,
rebuilds `apps/playground/dist`, and deploys that directory with GitHub Pages.

The deployed workbench requires no application server, runtime package installation, analytics,
arbitrary third-party adapter, or third-party CDN. Chromium acceptance tests cover compilation,
selection across the eleven-target catalog, the real MUI provider, accessibility structure,
copy/download behavior, stale-target handling, and responsive layout. Target fixtures separately
exercise framework-specific build contracts. A broader browser matrix remains follow-up hardening.
