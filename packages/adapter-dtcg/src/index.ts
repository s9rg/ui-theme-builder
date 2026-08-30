import type {
  JsonValue,
  ResolvedColor,
  ResolvedRole,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
  VirtualArtifact,
} from "@s9rg/theme-compiler";

export interface DtcgAdapterOptions {
  /** File stem used for every generated artifact. Unsafe characters are normalized. */
  readonly filePrefix?: string;
}

export const dtcgAdapterManifest = {
  id: "dtcg@2025.10",
  name: "DTCG 2025.10",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "Design Tokens Community Group",
    version: "2025.10",
  },
  capabilities: {
    colors: { native: "passthrough", fallback: "none" },
    schemes: { count: "multiple", ids: "any" },
    roles: { requirement: "optional", supported: "any", required: [] },
    preview: true,
  },
  options: {
    filePrefix: {
      type: "string",
      default: "theme",
      description: "File stem used for every generated artifact.",
      format: "file-stem",
    },
  },
} as const satisfies ThemeAdapterManifest;

interface DtcgColorToken {
  readonly $type: "color";
  readonly $value: DtcgColorValue | string;
  readonly $description?: string;
}

interface DtcgColorValue {
  readonly colorSpace: ResolvedColor["colorSpace"];
  readonly components: ResolvedColor["components"];
  readonly alpha: number;
  readonly hex?: string;
}

interface NamedScheme {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly ResolvedRole[];
}

interface DtcgTargetModel {
  readonly primitiveNames: ReadonlyMap<string, string>;
  readonly primitives: readonly {
    readonly id: string;
    readonly name: string;
    readonly label?: string;
    readonly value: ResolvedColor;
  }[];
  readonly schemes: readonly NamedScheme[];
}

const FORMAT_SCHEMA =
  "https://www.designtokens.org/schemas/2025.10/format.json";
const RESOLVER_SCHEMA =
  "https://www.designtokens.org/schemas/2025.10/resolver.json";

export function createDtcgAdapter(
  options: DtcgAdapterOptions = {},
): ThemeAdapter {
  const requestedFilePrefix = options.filePrefix ?? "theme";
  const filePrefix = normalizeFileStem(requestedFilePrefix);

  return {
    manifest: dtcgAdapterManifest,
    configuration: Object.freeze({ filePrefix }),
    compile(graph, context) {
      context.signal?.throwIfAborted();

      const diagnostics: ThemeDiagnostic[] = [];

      if (filePrefix !== requestedFilePrefix) {
        diagnostics.push({
          severity: "warning",
          code: "dtcg.file-prefix.normalized",
          message: `The file prefix was normalized to ${JSON.stringify(filePrefix)} to keep artifact paths safe.`,
        });
      }

      const model = buildTargetModel(graph);
      const primitiveFile = `${filePrefix}.primitives.tokens.json`;
      const schemeFiles = new Map(
        model.schemes.map(
          (scheme) =>
            [scheme.id, `${filePrefix}.${scheme.name}.tokens.json`] as const,
        ),
      );
      const artifacts: VirtualArtifact[] = [
        tokenArtifact(primitiveFile, buildPrimitiveDocument(model)),
        ...model.schemes.map((scheme) =>
          tokenArtifact(
            requireValue(schemeFiles.get(scheme.id), "scheme file"),
            buildSchemeDocument(model, scheme, diagnostics),
          ),
        ),
      ];

      if (model.schemes.length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "dtcg.no-schemes",
          message:
            "No semantic schemes were supplied; the resolver contains primitive tokens only.",
          path: ["schemes"],
        });
      } else if (model.schemes.length === 1) {
        diagnostics.push({
          severity: "info",
          code: "dtcg.single-scheme",
          message:
            "Only one scheme was supplied, so the resolver uses a set instead of a one-context modifier.",
          path: ["schemes"],
        });
      }

      if (!model.schemes.some((scheme) => scheme.id === "dark")) {
        diagnostics.push({
          severity: "info",
          code: "dtcg.missing-dark-scheme",
          message:
            "No dark scheme was supplied; no dark resolver context was generated.",
          path: ["schemes"],
        });
      }

      artifacts.push(
        jsonArtifact(
          `${filePrefix}.resolver.json`,
          buildResolverDocument(graph, model, primitiveFile, schemeFiles),
        ),
      );

      context.signal?.throwIfAborted();

      return {
        artifacts,
        diagnostics,
        preview: buildPreview(model),
      };
    },
  };
}

function buildTargetModel(graph: ThemeGraph): DtcgTargetModel {
  const primitiveIds = graph.primitives.map((primitive) => primitive.id);
  const primitiveNames = allocateNames(
    primitiveIds,
    "color",
    stripPaletteNamespace,
  );
  const roleIds = graph.schemes.flatMap((scheme) => Object.keys(scheme.roles));
  const roleNames = allocateNames(roleIds, "role");
  const schemeNames = allocateNames(
    graph.schemes.map((scheme) => scheme.id),
    "scheme",
    identity,
    ["primitives"],
  );

  return {
    primitiveNames,
    primitives: [...graph.primitives]
      .sort((left, right) => compareText(left.id, right.id))
      .map((primitive) => ({
        id: primitive.id,
        name: requireValue(primitiveNames.get(primitive.id), "primitive name"),
        ...(primitive.label === undefined ? {} : { label: primitive.label }),
        value: primitive.value,
      })),
    schemes: [...graph.schemes]
      .sort((left, right) => compareText(left.id, right.id))
      .map((scheme) => ({
        id: scheme.id,
        name: requireValue(schemeNames.get(scheme.id), "scheme name"),
        roles: Object.values(scheme.roles).sort((left, right) =>
          compareText(left.role, right.role),
        ),
        roleNames,
      }))
      .map(({ roleNames: names, ...scheme }) => ({
        ...scheme,
        roles: scheme.roles.map((role) => ({
          ...role,
          role: requireValue(names.get(role.role), "role name"),
        })),
      })),
  };
}

function buildPrimitiveDocument(model: DtcgTargetModel): JsonValue {
  const paletteEntries = model.primitives.map(
    (primitive) =>
      [primitive.name, colorToken(primitive.value, primitive.label)] as const,
  );

  return {
    $schema: FORMAT_SCHEMA,
    color: {
      palette: Object.fromEntries(paletteEntries),
    },
  } as unknown as JsonValue;
}

function buildSchemeDocument(
  model: DtcgTargetModel,
  scheme: NamedScheme,
  diagnostics: ThemeDiagnostic[],
): JsonValue {
  const semanticEntries = scheme.roles.map((role) => {
    const primitiveName = model.primitiveNames.get(role.ref);

    if (primitiveName === undefined) {
      diagnostics.push({
        severity: "warning",
        code: "dtcg.unresolved-primitive-alias",
        message: `Role ${JSON.stringify(role.role)} references a missing primitive; its resolved value was emitted instead.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
      return [role.role, colorToken(role.value)] as const;
    }

    return [
      role.role,
      {
        $type: "color",
        $value: `{color.palette.${primitiveName}}`,
      } satisfies DtcgColorToken,
    ] as const;
  });

  return {
    $schema: FORMAT_SCHEMA,
    color: {
      semantic: Object.fromEntries(semanticEntries),
    },
  } as unknown as JsonValue;
}

function buildResolverDocument(
  graph: ThemeGraph,
  model: DtcgTargetModel,
  primitiveFile: string,
  schemeFiles: ReadonlyMap<string, string>,
): JsonValue {
  const foundationSet = {
    description: "Primitive color tokens",
    sources: [{ $ref: `./${primitiveFile}` }],
  };

  if (model.schemes.length === 0) {
    return {
      $schema: RESOLVER_SCHEMA,
      name: graph.projectName ?? graph.projectId,
      version: "2025.10",
      sets: { foundation: foundationSet },
      resolutionOrder: [{ $ref: "#/sets/foundation" }],
    };
  }

  if (model.schemes.length === 1) {
    const scheme = requireValue(model.schemes[0], "scheme");
    const schemeFile = requireValue(schemeFiles.get(scheme.id), "scheme file");
    return {
      $schema: RESOLVER_SCHEMA,
      name: graph.projectName ?? graph.projectId,
      version: "2025.10",
      sets: {
        foundation: foundationSet,
        scheme: {
          description: "Semantic color scheme",
          sources: [{ $ref: `./${schemeFile}` }],
        },
      },
      resolutionOrder: [
        { $ref: "#/sets/foundation" },
        { $ref: "#/sets/scheme" },
      ],
    };
  }

  const defaultScheme =
    model.schemes.find((scheme) => scheme.id === "light") ??
    requireValue(model.schemes[0], "scheme");
  const contexts = Object.fromEntries(
    model.schemes.map((scheme) => [
      scheme.name,
      [
        {
          $ref: `./${requireValue(schemeFiles.get(scheme.id), "scheme file")}`,
        },
      ],
    ]),
  );

  return {
    $schema: RESOLVER_SCHEMA,
    name: graph.projectName ?? graph.projectId,
    version: "2025.10",
    sets: { foundation: foundationSet },
    modifiers: {
      theme: {
        description: "Color scheme",
        contexts,
        default: defaultScheme.name,
      },
    },
    resolutionOrder: [
      { $ref: "#/sets/foundation" },
      { $ref: "#/modifiers/theme" },
    ],
  };
}

function buildPreview(model: DtcgTargetModel): JsonValue {
  return {
    kind: "dtcg",
    version: "2025.10",
    primitives: Object.fromEntries(
      model.primitives.map((primitive) => [
        primitive.name,
        toDtcgColor(primitive.value),
      ]),
    ),
    schemes: Object.fromEntries(
      model.schemes.map((scheme) => [
        scheme.name,
        Object.fromEntries(
          scheme.roles.map((role) => [role.role, toDtcgColor(role.value)]),
        ),
      ]),
    ),
  } as unknown as JsonValue;
}

function colorToken(
  value: ResolvedColor,
  description?: string,
): DtcgColorToken {
  return {
    $type: "color",
    $value: toDtcgColor(value),
    ...(description === undefined ? {} : { $description: description }),
  };
}

function toDtcgColor(value: ResolvedColor): DtcgColorValue {
  const hex = dtcgHexFallback(value.hex);
  return {
    colorSpace: value.colorSpace,
    components: [value.components[0], value.components[1], value.components[2]],
    alpha: value.alpha,
    ...(hex === undefined ? {} : { hex }),
  };
}

function dtcgHexFallback(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const compact = value.slice(1);
  if (/^[0-9a-f]{3,4}$/i.test(compact)) {
    return `#${compact
      .slice(0, 3)
      .split("")
      .map((character) => character + character)
      .join("")}`.toLowerCase();
  }
  if (/^[0-9a-f]{6,8}$/i.test(compact)) {
    return `#${compact.slice(0, 6)}`.toLowerCase();
  }
  return undefined;
}

function tokenArtifact(path: string, value: JsonValue): VirtualArtifact {
  return {
    path,
    mediaType: "application/design-tokens+json",
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function jsonArtifact(path: string, value: JsonValue): VirtualArtifact {
  return {
    path,
    mediaType: "application/json",
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function normalizeFileStem(value: string): string {
  return safeSegment(value, "theme");
}

function allocateNames(
  values: readonly string[],
  fallback: string,
  project: (value: string) => string = identity,
  reserved: readonly string[] = [],
): ReadonlyMap<string, string> {
  const uniqueValues = [...new Set(values)].sort(compareText);
  const entries = uniqueValues.map((value) => ({
    value,
    base: safeSegment(project(value), fallback),
  }));
  const counts = new Map<string, number>();
  for (const { base } of entries) {
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  const used = new Set(reserved);
  const result = new Map<string, string>();
  for (const { value, base } of entries.sort(
    (left, right) =>
      compareText(left.base, right.base) ||
      compareText(left.value, right.value),
  )) {
    const needsSuffix = (counts.get(base) ?? 0) > 1 || used.has(base);
    const preferred = needsSuffix ? `${base}-${stableHash(value)}` : base;
    result.set(value, claimName(preferred, used));
  }
  return result;
}

function claimName(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }

  let suffix = 2;
  while (used.has(`${preferred}-${suffix}`)) suffix += 1;
  const claimed = `${preferred}-${suffix}`;
  used.add(claimed);
  return claimed;
}

function stripPaletteNamespace(value: string): string {
  return value.startsWith("palette.") ? value.slice("palette.".length) : value;
}

function identity(value: string): string {
  return value;
}

function safeSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const candidate = normalized.length === 0 ? fallback : normalized;
  if (["__proto__", "constructor", "prototype"].includes(candidate)) {
    return `${fallback}-${candidate.replace(/^_+|_+$/g, "")}`;
  }
  return candidate.startsWith("$")
    ? `${fallback}-${candidate.slice(1)}`
    : candidate;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(
      `Internal adapter invariant failed: missing ${description}.`,
    );
  }
  return value;
}
