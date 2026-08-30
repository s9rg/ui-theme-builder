# 0.6.0 release checklist

This checklist is intentionally evidence-based. Check a gate only after it succeeds for the reviewed
0.6.0 commit. Do not publish packages, create the release tag, or deploy Pages from a tree that differs
from that commit.

## Product decisions

- [x] Keep array order semantically neutral; require explicit semantic mappings before compilation.
- [x] Expand the catalog from four to eleven beta target adapters.
- [x] Add Ant Design v6, shadcn v4, daisyUI v5, Vuetify v4, Angular Material v22, Ionic v9, and React
      Native Paper v5.
- [x] Disclose target-specific derivation and inheritance through diagnostics.
- [x] Label preview evidence as exact runtime, exact CSS variables, mapped preview, compile-verified,
      or native-web approximation.
- [x] Defer Chakra UI and Mantine until a versioned tonal-ramp recipe exists; do not manufacture their
      ordered shade contracts.
- [x] Defer NativeWind v5 while its Tailwind CSS v4 line remains prerelease.

## Local candidate gates

- [x] `npm ci` succeeds from the candidate lockfile on a clean checkout.
- [x] `npm run format:check` and `npm run lint` pass.
- [x] Strict compiler/package and workbench typechecking passes.
- [x] Unit, adversarial boundary, and all-theory/all-target compilation suites pass.
- [x] All fourteen public packages build; every packed tarball passes publint strict and Are the Types
      Wrong strict.
- [x] DTCG, CSS, Tailwind v4, MUI v9, Ant Design v6, shadcn v4, daisyUI v5, Vuetify v4, and Ionic v9
      consumer fixtures pass.
- [x] Angular Material v22 generated Sass compiles and its isolated Angular fixture passes AOT.
- [x] React Native Paper v5 generated TypeScript typechecks and Metro produces both iOS and Android
      production bundles.
- [x] Chromium workbench acceptance and Axe checks pass across the eleven-target catalog.
- [x] The Pages production build uses `/ui-theme-builder/`, contains no external runtime asset
      dependency, and includes deterministic notices for bundled third-party code.
- [x] Root manifest/lock pollution and synchronized 0.6.0 version guards pass.
- [x] Production dependency audit is clean; any remaining development-only advisory is documented and
      accepted explicitly.

Local evidence recorded on 2026-08-29: `npm ci` preserved the manifest and lock hashes; 197 Vitest
tests, 22 Chromium/keyboard/Axe journeys, nine web target fixtures, Angular Material Sass/AOT, both
Paper Metro bundles, fourteen strict packed-package checks, and both npm audits passed.

## Manual evidence

- [x] Capture the complete desktop workbench with the eleven-target selector.
- [x] Capture representative light and dark results, including the real MUI provider.
- [x] Capture the 390 px mobile layout with no horizontal overflow.
- [x] Confirm seed/harmony edit → semantic mapping → artifact and themed-shell update in the in-app
      browser.
- [ ] Review generated paths, files, warnings, and informational diagnostics for all eleven targets.
- [ ] Confirm keyboard navigation, visible focus, copy/download feedback, scheme switching, and ZIP
      export manually.
- [ ] Record VoiceOver, TalkBack, and NVDA/JAWS review separately; automated Axe results are not a
      substitute for assistive-technology evidence.
- [x] Perform a final visual screenshot review and RFC/research-claim audit.

## Pull request, CI, and Pages

- [ ] Commit the reviewed candidate on a branch and push it to GitHub.
- [ ] Open a pull request against protected `main` and wait for `CI required` on the exact head SHA.
- [ ] Confirm static analysis and Node 20.19, 22, and 24 unit jobs succeed.
- [ ] Confirm package/Pages build, target fixtures, package tarball checks, and Chromium acceptance
      succeed.
- [ ] Confirm the isolated Angular Material AOT/Sass and React Native Paper iOS/Android Metro jobs
      succeed.
- [ ] Merge only after the required check is green; record the resulting `main` SHA.
- [ ] Wait for the post-merge CI run and Pages deployment on that exact `main` SHA.
- [ ] Smoke the public page, hashed JS/CSS assets, notices, generated downloads, repository links, and
      displayed compiler commit/version.

## Package publication

- [ ] Confirm npm namespace ownership and that every intended `0.6.0` version is unpublished.
- [ ] Seal and hash one exact set of tarballs from the reviewed `main` SHA.
- [ ] Publish `@s9rg/theme-compiler@0.6.0` before adapters that depend on it.
- [ ] Publish the eleven adapters, `@s9rg/theme-input-colorwheel`, and
      `@s9rg/theme-demo-protocol` from those exact tarballs with public access and the intended tag.
- [ ] Verify npm registry metadata, integrity, provenance/status, and clean consumer installs for every
      package.
- [ ] Create tag `v0.6.0` on the published SHA and create the GitHub release only after registry
      verification succeeds.
