# 0.5.0 release checklist

This checklist is intentionally evidence-based. Do not publish packages or deploy Pages from a tree
that differs from the reviewed commit.

## Product decisions

- [x] Reserve the repository name and final npm package namespace.
- [x] Keep a transparent starter mapping in the workbench and defer a general automatic
      ramp/semantic suggestion engine to a later recipe package.
- [x] Keep array order semantically neutral; explicit mappings are required.
- [x] Mark every first-party target adapter beta.

## Automated candidate gates

- [x] Formatting and ESLint pass from a clean checkout.
- [x] Strict compiler/package typechecking passes on the supported Node floor and current LTS.
- [x] Unit and adversarial boundary suites pass.
- [x] DTCG, CSS, Tailwind v4, and MUI v9 target fixtures compile.
- [x] Every packed package passes publint strict and Are the Types Wrong strict.
- [x] Chromium workbench acceptance and Axe checks pass.
- [x] Pages production build uses `/ui-theme-builder/`, contains no external runtime asset dependency,
      and includes deterministic notices for bundled third-party code.
- [x] Root manifest/lock pollution guard passes.

## Manual evidence

- [x] Capture the complete desktop workbench.
- [x] Capture a real MUI dark-scheme result.
- [x] Capture a 390 px mobile result with no horizontal overflow.
- [x] Confirm palette edit → semantic mapping → artifact and provider update in the in-app browser.
- [x] Review generated files and diagnostics for all four launch targets.

## Repository and Pages

- [x] Create a clean-root public GitHub repository; do not import unrelated history.
- [x] Enable GitHub Pages with GitHub Actions.
- [x] Protect `main` with the stable `CI required` check.
- [x] Push the reviewed commit and wait for CI and Pages on that exact SHA.
- [x] Smoke the public page, hashed JS/CSS assets, third-party notices, generated downloads, and
      repository links.

## Package publication

- [x] Replace provisional metadata with final repository/homepage/bugs URLs.
- [ ] Seal and hash one exact set of tarballs from the reviewed commit.
- [x] Confirm npm namespace ownership and unpublished versions.
- [ ] Publish the exact tarballs, then verify registry integrity and clean consumer installs.
- [ ] Tag and create the GitHub release only after registry verification succeeds.
