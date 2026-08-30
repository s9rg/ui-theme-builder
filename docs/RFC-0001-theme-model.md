# RFC 0001: Theme project and compiler model

Status: Implemented 0.x contract
Target: `0.6.0`

## Decision

Theme Compiler accepts color primitives and explicit semantic bindings. It validates and resolves them
into one immutable `ThemeGraph` before any target adapter runs.

Array position never implies `primary`, `background`, `success`, or another UI role. Automatic role
suggestions and generated palettes are outside the headless compiler contract. The workbench's
Colorwheel harmony recipe is an explicit input step that still produces named primitives and explicit
semantic bindings before compilation.

## Implemented layers

1. `ThemeProject` stores a schema version, project ID and optional name, color primitives, and semantic
   schemes.
2. The compiler validates the project and resolves every role reference into a `ThemeGraph` containing
   `ResolvedPrimitive`, `ResolvedScheme`, and `ResolvedRole` values.
3. A `ThemeAdapter` receives the graph and an optional abort signal. It returns virtual artifacts,
   diagnostics, and optional JSON preview data, synchronously or asynchronously.
4. The compiler validates adapter compatibility and output boundaries, rejects unsafe or colliding
   artifact paths, enforces size/count limits, and appends `theme.lock.json` after a successful compile.
5. A host such as the browser workbench decides whether and where to copy, download, or write files.

The compiler snapshots input data, adapter manifests, and preview JSON around asynchronous boundaries.
Adapters run in caller-provided code, not in a security sandbox.

## Initial color boundary

String input accepts only strict hexadecimal CSS colors: `#RGB`, `#RGBA`, `#RRGGBB`, and
`#RRGGBBAA`. Structured colors use the DTCG-shaped `StructuredColor` form with a named color space,
three components, optional alpha, and optional six-digit hex fallback.

This boundary does not implement the complete CSS Color 4 grammar. Unsupported strings are errors
rather than host-dependent interpretations. The compiler preserves supported structured color spaces;
an input adapter may deliberately convert before constructing a project. For example,
`@s9rg/theme-input-colorwheel` maps Colorwheel colors into portable sRGB primitives for this release.

## Semantic roles

The compiler validates role identifiers but otherwise treats them as opaque. It has no built-in role
vocabulary and does not infer, rename, or reinterpret roles.

Each adapter documents the role names it understands. Framework adapters map only roles with a
same-purpose target token; unknown or unsafe mappings produce diagnostics and are skipped. A generic
`secondary`, for example, is not reinterpreted as Ant Design's `info` or daisyUI's `accent`. The CSS,
Tailwind, and DTCG adapters preserve arbitrary valid semantic role names after deterministic output
sanitization.

Target algorithms may derive values only when that derivation is part of the documented target
contract. Ant Design derives its state tokens through its named light/dark algorithms. Angular
Material receives full Material 3 tonal maps from the pinned Material Color Utilities algorithm.
Ionic receives its documented shade, tint, contrast fallback, and stepped mixes. Every such operation
is surfaced in diagnostics. The compiler does not pretend those derived values were authored roles.

## Adapter contract

Every `ThemeAdapterManifest` declares:

- a versioned `id`, display `name`, and implementation `adapterVersion`;
- `engineApiVersion` (exactly `"1"` in this contract);
- `maturity`: `stable`, `beta`, or `experimental`;
- a target name and version string;
- color capabilities with native spaces and optional sRGB-hex fallback;
- scheme capabilities with a count and accepted IDs;
- role capabilities with requirement, supported names, and required names;
- preview support;
- a public schema for string, boolean, number, and enum options.

All first-party adapters currently declare beta maturity. Adapter factory options are captured before
compilation; `compile(graph, context)` receives only the resolved graph and optional `AbortSignal`.
First-party adapters are deterministic build-time functions: they do not write files, install packages,
fetch from the network, or evaluate user code.

## Implemented target profiles

Version 0.6.0 ships eleven target profiles:

- DTCG 2025.10 emits `theme.primitives.tokens.json`, one
  `theme.<scheme>.tokens.json` per scheme, and `theme.resolver.json` with the default file prefix.
- CSS emits `theme.css`; Tailwind CSS v4 emits `theme.tailwind.css`.
- Material UI v9 emits `theme.ts`; Ant Design v6 emits `antd/theme.ts`.
- shadcn v4 emits the partial registry item `shadcn/theme.json`; daisyUI v5 emits
  `daisyui/theme.css`.
- Vuetify v4 emits `vuetify.theme.ts`; Angular Material v22 emits
  `angular-material.theme.scss`.
- Ionic v9 emits the cross-framework `ionic.theme.css`; React Native Paper v5 emits
  `react-native-paper/theme.ts`.

The compiler appends one `theme.lock.json` after all selected adapters succeed. Artifact paths are
virtual and deterministic; adapters do not write them to disk.

Completeness differs intentionally by target. shadcn outputs a partial theme, and daisyUI, Vuetify,
and React Native Paper preserve framework defaults for unauthored roles. Ant Design and Angular
Material delegate documented derived state or tonal values to target-specific algorithms. The
workbench and compiler diagnostics disclose these boundaries instead of claiming that a small flat
palette is a complete provider theme.

## Lock data and version axes

On success, `theme.lock.json` records:

- lock schema version and compiler contract version;
- project ID and a hash of the snapped project;
- adapter ID, engine API version, implementation version, maturity, target name/version, and normalized
  factory configuration stored inline (configuration must be non-secret);
- each adapter artifact's path, media type, owning adapter, byte size, and content hash.

The project schema, compiler/adapter ABI, adapter implementation, adapter target, and artifact content
can therefore evolve independently. The current lock does not record a recipe because recipes are not
implemented.

The lockfile is verification evidence, not a reconstructive format. It does not contain the complete
primitive values, semantic bindings, authored option source, diagnostics, or preview payloads. Authors
must retain the source `ThemeProject` and adapter configuration separately. Factory configuration is
captured before project-dependent derivation; artifact hashes bind the resulting effective output.

## Persistence status

`ThemeProject.schemaVersion` lets the compiler reject incompatible in-memory data. It is not yet a
promise that serialized 0.x projects will receive migrations. The 0.x line does not commit to a
storage encoding, compatibility window, migration API, or policy for preserving unknown future
fields. Hosts that persist projects must treat their own format as application-owned until a separate
persistence RFC is accepted.

## Determinism and safety

- No generated timestamp is included.
- Stable IDs are distinct from display labels.
- First-party adapters sanitize and deterministically disambiguate output identifiers.
- The compiler rejects absolute paths, traversal segments, backslashes, unsafe platform names,
  duplicate paths (case-insensitively), reserved `theme.lock.json`, oversized files, and excessive file
  counts.
- Runtime data boundaries reject accessors, symbol properties, unsupported prototypes, and excessively
  large object graphs.
- Adapter preview data must be finite, acyclic JSON.
- Generated JavaScript and TypeScript are downloadable text and are never evaluated by the workbench.

## Deferred decisions

- Complete CSS Color 4 parsing.
- Versioned OKLCH ramp and scheme recipes, including the ordered 11- and 10-shade contracts needed
  for honest Chakra UI and Mantine adapters.
- Role suggestions and explicit acceptance metadata.
- Project provenance and namespaced target overrides.
- High-contrast scheme synthesis.
- Third-party adapter loading, isolation, and trust policy.
- A stable cross-target chart and data-visualization role vocabulary.
- A stable NativeWind v5 target after its Tailwind CSS v4 line leaves prerelease, plus an explicit
  native CSS/token boundary.
