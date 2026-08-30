import type {
  JsonValue,
  ResolvedColor,
  ResolvedScheme,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
} from "@s9rg/theme-compiler";

export interface ReactNativePaperAdapterPreviewTheme {
  readonly base: "MD3LightTheme" | "MD3DarkTheme";
  /** Explicit overrides only. Every omitted value is inherited from the base. */
  readonly colors: Readonly<Record<string, JsonValue>>;
}

export interface ReactNativePaperAdapterPreview {
  readonly kind: "react-native-paper-themes";
  readonly targetVersion: "5";
  readonly themes: {
    readonly light: ReactNativePaperAdapterPreviewTheme;
    readonly dark: ReactNativePaperAdapterPreviewTheme;
  };
}

export const REACT_NATIVE_PAPER_SUPPORTED_ROLES = [
  "primary",
  "primary-container",
  "secondary",
  "secondary-container",
  "tertiary",
  "tertiary-container",
  "surface",
  "surface-variant",
  "surface-disabled",
  "background",
  "error",
  "error-container",
  "on-primary",
  "primary-foreground",
  "on-primary-container",
  "primary-container-foreground",
  "on-secondary",
  "secondary-foreground",
  "on-secondary-container",
  "secondary-container-foreground",
  "on-tertiary",
  "tertiary-foreground",
  "on-tertiary-container",
  "tertiary-container-foreground",
  "on-surface",
  "surface-foreground",
  "foreground",
  "on-surface-variant",
  "surface-variant-foreground",
  "muted-foreground",
  "on-surface-disabled",
  "surface-disabled-foreground",
  "on-error",
  "error-foreground",
  "on-error-container",
  "error-container-foreground",
  "on-background",
  "background-foreground",
  "outline",
  "divider",
  "outline-variant",
  "inverse-surface",
  "inverse-on-surface",
  "inverse-surface-foreground",
  "inverse-primary",
  "shadow",
  "scrim",
  "backdrop",
  "elevation-level-0",
  "elevation-level-1",
  "elevation-level-2",
  "elevation-level-3",
  "elevation-level-4",
  "elevation-level-5",
] as const;

export const reactNativePaperAdapterManifest = {
  id: "react-native-paper@5",
  name: "React Native Paper v5",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "react-native-paper",
    version: ">=5 <6",
  },
  capabilities: {
    colors: { native: ["srgb", "hsl"], fallback: "srgb-hex" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "optional",
      supported: REACT_NATIVE_PAPER_SUPPORTED_ROLES,
      required: [],
    },
    preview: true,
  },
  options: {},
} as const satisfies ThemeAdapterManifest;

type PaperSchemeId = "light" | "dark";
type PaperColorPath =
  | readonly [
      | "primary"
      | "primaryContainer"
      | "secondary"
      | "secondaryContainer"
      | "tertiary"
      | "tertiaryContainer"
      | "surface"
      | "surfaceVariant"
      | "surfaceDisabled"
      | "background"
      | "error"
      | "errorContainer"
      | "onPrimary"
      | "onPrimaryContainer"
      | "onSecondary"
      | "onSecondaryContainer"
      | "onTertiary"
      | "onTertiaryContainer"
      | "onSurface"
      | "onSurfaceVariant"
      | "onSurfaceDisabled"
      | "onError"
      | "onErrorContainer"
      | "onBackground"
      | "outline"
      | "outlineVariant"
      | "inverseSurface"
      | "inverseOnSurface"
      | "inversePrimary"
      | "shadow"
      | "scrim"
      | "backdrop",
    ]
  | readonly ["elevation", `level${0 | 1 | 2 | 3 | 4 | 5}`];

interface RoleMapping {
  /** Earlier entries are more target-specific and win collisions. */
  readonly sourceRoles: readonly string[];
  readonly path: PaperColorPath;
}

interface PaperTargetModel {
  readonly light: Readonly<Record<string, JsonValue>>;
  readonly dark: Readonly<Record<string, JsonValue>>;
}

const ROLE_MAPPINGS: readonly RoleMapping[] = [
  { sourceRoles: ["primary"], path: ["primary"] },
  { sourceRoles: ["primary-container"], path: ["primaryContainer"] },
  { sourceRoles: ["secondary"], path: ["secondary"] },
  { sourceRoles: ["secondary-container"], path: ["secondaryContainer"] },
  { sourceRoles: ["tertiary"], path: ["tertiary"] },
  { sourceRoles: ["tertiary-container"], path: ["tertiaryContainer"] },
  { sourceRoles: ["surface"], path: ["surface"] },
  { sourceRoles: ["surface-variant"], path: ["surfaceVariant"] },
  { sourceRoles: ["surface-disabled"], path: ["surfaceDisabled"] },
  { sourceRoles: ["background"], path: ["background"] },
  { sourceRoles: ["error"], path: ["error"] },
  { sourceRoles: ["error-container"], path: ["errorContainer"] },
  {
    sourceRoles: ["on-primary", "primary-foreground"],
    path: ["onPrimary"],
  },
  {
    sourceRoles: ["on-primary-container", "primary-container-foreground"],
    path: ["onPrimaryContainer"],
  },
  {
    sourceRoles: ["on-secondary", "secondary-foreground"],
    path: ["onSecondary"],
  },
  {
    sourceRoles: ["on-secondary-container", "secondary-container-foreground"],
    path: ["onSecondaryContainer"],
  },
  {
    sourceRoles: ["on-tertiary", "tertiary-foreground"],
    path: ["onTertiary"],
  },
  {
    sourceRoles: ["on-tertiary-container", "tertiary-container-foreground"],
    path: ["onTertiaryContainer"],
  },
  {
    sourceRoles: ["on-surface", "surface-foreground", "foreground"],
    path: ["onSurface"],
  },
  {
    sourceRoles: [
      "on-surface-variant",
      "surface-variant-foreground",
      "muted-foreground",
    ],
    path: ["onSurfaceVariant"],
  },
  {
    sourceRoles: ["on-surface-disabled", "surface-disabled-foreground"],
    path: ["onSurfaceDisabled"],
  },
  {
    sourceRoles: ["on-error", "error-foreground"],
    path: ["onError"],
  },
  {
    sourceRoles: ["on-error-container", "error-container-foreground"],
    path: ["onErrorContainer"],
  },
  {
    sourceRoles: ["on-background", "background-foreground", "foreground"],
    path: ["onBackground"],
  },
  { sourceRoles: ["outline"], path: ["outline"] },
  {
    sourceRoles: ["outline-variant", "divider"],
    path: ["outlineVariant"],
  },
  { sourceRoles: ["inverse-surface"], path: ["inverseSurface"] },
  {
    sourceRoles: ["inverse-on-surface", "inverse-surface-foreground"],
    path: ["inverseOnSurface"],
  },
  { sourceRoles: ["inverse-primary"], path: ["inversePrimary"] },
  { sourceRoles: ["shadow"], path: ["shadow"] },
  { sourceRoles: ["scrim"], path: ["scrim"] },
  { sourceRoles: ["backdrop"], path: ["backdrop"] },
  { sourceRoles: ["elevation-level-0"], path: ["elevation", "level0"] },
  { sourceRoles: ["elevation-level-1"], path: ["elevation", "level1"] },
  { sourceRoles: ["elevation-level-2"], path: ["elevation", "level2"] },
  { sourceRoles: ["elevation-level-3"], path: ["elevation", "level3"] },
  { sourceRoles: ["elevation-level-4"], path: ["elevation", "level4"] },
  { sourceRoles: ["elevation-level-5"], path: ["elevation", "level5"] },
] as const;

const KNOWN_ROLES = new Set<string>(REACT_NATIVE_PAPER_SUPPORTED_ROLES);

/** Creates a React Native Paper v5 MD3 theme-module adapter. */
export function createReactNativePaperAdapter(): ThemeAdapter {
  return {
    manifest: reactNativePaperAdapterManifest,
    compile(graph, context) {
      context.signal?.throwIfAborted();

      const diagnostics: ThemeDiagnostic[] = [];
      const model = buildTargetModel(graph, diagnostics);
      const source = renderThemeModule(model);

      context.signal?.throwIfAborted();

      return {
        artifacts: [
          {
            path: "react-native-paper/theme.ts",
            mediaType: "text/typescript",
            content: source,
          },
        ],
        diagnostics,
        preview: {
          kind: "react-native-paper-themes",
          targetVersion: "5",
          themes: {
            light: { base: "MD3LightTheme", colors: model.light },
            dark: { base: "MD3DarkTheme", colors: model.dark },
          },
        } as JsonValue,
      };
    },
  };
}

function buildTargetModel(
  graph: ThemeGraph,
  diagnostics: ThemeDiagnostic[],
): PaperTargetModel {
  const schemes = new Map<PaperSchemeId, ResolvedScheme>();

  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareText(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "react-native-paper.scheme.unsupported",
        message: `React Native Paper generation supports only light and dark schemes; ${JSON.stringify(scheme.id)} was not emitted.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    schemes.set(scheme.id, scheme);
  }

  return {
    light: buildSchemeOverrides("light", schemes.get("light"), diagnostics),
    dark: buildSchemeOverrides("dark", schemes.get("dark"), diagnostics),
  };
}

function buildSchemeOverrides(
  schemeId: PaperSchemeId,
  scheme: ResolvedScheme | undefined,
  diagnostics: ThemeDiagnostic[],
): Readonly<Record<string, JsonValue>> {
  const colors: Record<string, JsonValue> = {};

  if (scheme === undefined) {
    diagnostics.push({
      severity: "info",
      code: "react-native-paper.defaults.inherited",
      message: `No ${schemeId} scheme was supplied; ${schemeId}Theme inherits every color from ${schemeId === "light" ? "MD3LightTheme" : "MD3DarkTheme"}. No Material tones were synthesized.`,
      path: ["schemes"],
    });
    return colors;
  }

  for (const role of Object.values(scheme.roles).sort((left, right) =>
    compareText(left.role, right.role),
  )) {
    if (!KNOWN_ROLES.has(role.role)) {
      diagnostics.push({
        severity: "warning",
        code: "react-native-paper.role.unsupported",
        message: `Semantic role ${JSON.stringify(role.role)} has no React Native Paper MD3 mapping and was skipped.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
  }

  for (const mapping of ROLE_MAPPINGS) {
    const candidates = mapping.sourceRoles.filter(
      (roleName) => roleName in scheme.roles,
    );
    if (candidates.length === 0) continue;

    const selectedRoleName = requireValue(
      candidates[0],
      "React Native Paper role mapping",
    );
    if (candidates.length > 1) {
      diagnostics.push({
        severity: "warning",
        code: "react-native-paper.role.collision",
        message: `Roles ${candidates.map((role) => JSON.stringify(role)).join(", ")} map to ${formatPath(mapping.path)}; ${JSON.stringify(selectedRoleName)} was used.`,
        path: ["schemes", scheme.id, "roles"],
      });
    }

    const role = requireValue(scheme.roles[selectedRoleName], "resolved role");
    const converted = colorToPaper(role.value);
    if (converted.value === undefined) {
      diagnostics.push({
        severity: "error",
        code: "react-native-paper.color.unsupported",
        message: `Role ${JSON.stringify(selectedRoleName)} uses ${JSON.stringify(role.value.colorSpace)} without a safe sRGB fallback and cannot be emitted.`,
        path: ["schemes", scheme.id, "roles", selectedRoleName],
      });
      continue;
    }
    if (converted.usedFallback) {
      diagnostics.push({
        severity: "info",
        code: "react-native-paper.color-fallback.used",
        message: `Role ${JSON.stringify(selectedRoleName)} uses its sRGB hex fallback because React Native Paper v5 does not portably accept ${JSON.stringify(role.value.colorSpace)}.`,
        path: ["schemes", scheme.id, "roles", selectedRoleName],
      });
    }

    setPaperPath(colors, mapping.path, converted.value);
  }

  const inherited = ROLE_MAPPINGS.filter(
    (mapping) => !hasPaperPath(colors, mapping.path),
  ).map((mapping) => formatPath(mapping.path));
  if (inherited.length > 0) {
    diagnostics.push({
      severity: "info",
      code: "react-native-paper.defaults.inherited",
      message: `Scheme ${JSON.stringify(scheme.id)} leaves ${inherited.length} MD3 color value${inherited.length === 1 ? "" : "s"} on ${schemeId === "light" ? "MD3LightTheme" : "MD3DarkTheme"} defaults (${inherited.join(", ")}). No Material tones were synthesized.`,
      path: ["schemes", scheme.id, "roles"],
    });
  }

  return colors;
}

function setPaperPath(
  target: Record<string, JsonValue>,
  path: PaperColorPath,
  value: string,
): void {
  if (path.length === 1) {
    target[path[0]] = value;
    return;
  }

  const existing = target.elevation;
  const elevation: Record<string, JsonValue> = isJsonRecord(existing)
    ? { ...existing }
    : {};
  elevation[path[1]] = value;
  target.elevation = elevation;
}

function hasPaperPath(
  target: Readonly<Record<string, JsonValue>>,
  path: PaperColorPath,
): boolean {
  if (path.length === 1) return typeof target[path[0]] === "string";
  const elevation = target.elevation;
  return isJsonRecord(elevation) && typeof elevation[path[1]] === "string";
}

function colorToPaper(color: ResolvedColor): {
  readonly value?: string;
  readonly usedFallback: boolean;
} {
  const first = color.components[0];
  const second = color.components[1];
  const third = color.components[2];

  if (
    color.colorSpace === "hsl" &&
    isNumber(first) &&
    isNumber(second) &&
    isNumber(third)
  ) {
    return {
      value:
        color.alpha === 1
          ? `hsl(${formatNumber(first)}, ${formatNumber(second)}%, ${formatNumber(third)}%)`
          : `hsla(${formatNumber(first)}, ${formatNumber(second)}%, ${formatNumber(third)}%, ${formatNumber(color.alpha)})`,
      usedFallback: false,
    };
  }

  if (isHexFallback(color.hex)) {
    return {
      value: hexWithAlpha(color.hex, color.alpha),
      usedFallback: color.colorSpace !== "srgb",
    };
  }

  if (
    color.colorSpace === "srgb" &&
    isNumber(first) &&
    isNumber(second) &&
    isNumber(third)
  ) {
    const channels = [first, second, third].map((channel) =>
      Math.round(clamp(channel, 0, 1) * 255),
    );
    return {
      value:
        color.alpha === 1
          ? `rgb(${channels.join(", ")})`
          : `rgba(${channels.join(", ")}, ${formatNumber(color.alpha)})`,
      usedFallback: false,
    };
  }

  return { usedFallback: false };
}

function hexWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.toLowerCase();
  if (alpha === 1) return normalized;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${formatNumber(alpha)})`;
}

function renderThemeModule(model: PaperTargetModel): string {
  return [
    "// Generated by @s9rg/theme-adapter-react-native-paper.",
    "// Unspecified MD3 values intentionally inherit from React Native Paper.",
    "import {",
    "  MD3DarkTheme,",
    "  MD3LightTheme,",
    "  type MD3Theme,",
    '} from "react-native-paper";',
    "",
    renderTheme("lightTheme", "MD3LightTheme", model.light),
    "",
    renderTheme("darkTheme", "MD3DarkTheme", model.dark),
    "",
    "export const paperThemes = {",
    "  light: lightTheme,",
    "  dark: darkTheme,",
    "} as const;",
    "",
    "export default lightTheme;",
    "",
  ].join("\n");
}

function renderTheme(
  exportName: "lightTheme" | "darkTheme",
  baseName: "MD3LightTheme" | "MD3DarkTheme",
  colors: Readonly<Record<string, JsonValue>>,
): string {
  const entries = Object.entries(colors);
  if (entries.length === 0) {
    return [
      `export const ${exportName} = {`,
      `  ...${baseName},`,
      `} satisfies MD3Theme;`,
    ].join("\n");
  }

  const lines = [
    `export const ${exportName} = {`,
    `  ...${baseName},`,
    "  colors: {",
    `    ...${baseName}.colors,`,
  ];
  for (const [key, value] of entries) {
    if (key === "elevation" && isJsonRecord(value)) {
      lines.push(
        '    "elevation": {',
        `      ...${baseName}.colors.elevation,`,
      );
      for (const [level, levelValue] of Object.entries(value)) {
        lines.push(
          `      ${JSON.stringify(level)}: ${serializeString(levelValue)},`,
        );
      }
      lines.push("    },");
      continue;
    }
    lines.push(`    ${JSON.stringify(key)}: ${serializeString(value)},`);
  }
  lines.push("  },", `} satisfies MD3Theme;`);
  return lines.join("\n");
}

function serializeString(value: JsonValue): string {
  if (typeof value !== "string") {
    throw new Error(
      "Internal adapter invariant failed: Paper colors must be strings.",
    );
  }
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function formatPath(path: PaperColorPath): string {
  return path.join(".");
}

function isHexFallback(value: string | undefined): value is string {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value);
}

function isNumber(value: number | "none"): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isJsonRecord(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
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
