import type {
  JsonValue,
  ResolvedColor,
  ResolvedScheme,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
} from "@s9rg/theme-compiler";

export interface VuetifyAdapterOptions {
  /** Identifier used for the exported Vuetify theme options. */
  readonly exportName?: string;
}

export const VUETIFY_SUPPORTED_ROLES = [
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "error",
  "error-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
  "success",
  "success-foreground",
  "background",
  "surface",
  "foreground",
  "muted-foreground",
  "divider",
] as const;

export const vuetifyAdapterManifest = {
  id: "vuetify@4",
  name: "Vuetify v4",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: { name: "vuetify", version: ">=4 <5" },
  capabilities: {
    colors: { native: ["srgb", "hsl"], fallback: "srgb-hex" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "required",
      supported: VUETIFY_SUPPORTED_ROLES,
      required: ["primary"],
    },
    preview: true,
  },
  options: {
    exportName: {
      type: "string",
      default: "themeOptions",
      description: "Identifier used for the exported Vuetify theme options.",
      format: "identifier",
    },
  },
} as const satisfies ThemeAdapterManifest;

interface VuetifyThemeModel {
  readonly dark: boolean;
  readonly colors: Readonly<Record<string, string>>;
  readonly variables: Readonly<Record<string, string | number>>;
}

interface VuetifyTargetModel {
  readonly defaultTheme?: "light" | "dark" | "system";
  readonly themes: Readonly<
    Partial<Record<"light" | "dark", VuetifyThemeModel>>
  >;
}

interface RoleMapping {
  readonly source: string;
  readonly colors?: readonly string[];
}

const ROLE_MAPPINGS: readonly RoleMapping[] = [
  { source: "primary", colors: ["primary"] },
  { source: "primary-foreground", colors: ["on-primary"] },
  { source: "secondary", colors: ["secondary"] },
  { source: "secondary-foreground", colors: ["on-secondary"] },
  { source: "error", colors: ["error"] },
  { source: "error-foreground", colors: ["on-error"] },
  { source: "warning", colors: ["warning"] },
  { source: "warning-foreground", colors: ["on-warning"] },
  { source: "info", colors: ["info"] },
  { source: "info-foreground", colors: ["on-info"] },
  { source: "success", colors: ["success"] },
  { source: "success-foreground", colors: ["on-success"] },
  { source: "background", colors: ["background"] },
  { source: "surface", colors: ["surface"] },
  { source: "foreground", colors: ["on-background", "on-surface"] },
  { source: "muted-foreground", colors: ["on-surface-variant"] },
];

const KNOWN_ROLES = new Set<string>(VUETIFY_SUPPORTED_ROLES);
const RESERVED_EXPORTS = new Set([
  "ThemeDefinition",
  "VuetifyOptions",
  "lightTheme",
  "darkTheme",
]);
const RESERVED_IDENTIFIERS = new Set([
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

export function createVuetifyAdapter(
  options: VuetifyAdapterOptions = {},
): ThemeAdapter {
  const requestedExportName = options.exportName ?? "themeOptions";
  const exportName = normalizeIdentifier(requestedExportName);

  return {
    manifest: vuetifyAdapterManifest,
    configuration: Object.freeze({ exportName }),
    compile(graph, context) {
      context.signal?.throwIfAborted();
      const diagnostics: ThemeDiagnostic[] = [];
      if (exportName !== requestedExportName) {
        diagnostics.push({
          severity: "warning",
          code: "vuetify.export-name.normalized",
          message: `The TypeScript export name was normalized to ${JSON.stringify(exportName)}.`,
        });
      }
      const model = buildTargetModel(graph, diagnostics);
      context.signal?.throwIfAborted();
      return {
        artifacts: [
          {
            path: "vuetify.theme.ts",
            mediaType: "text/typescript",
            content: renderThemeModule(model, exportName),
          },
        ],
        diagnostics,
        preview: {
          kind: "vuetify-theme-options",
          targetVersion: "4",
          ...model,
        } as unknown as JsonValue,
      };
    },
  };
}

function buildTargetModel(
  graph: ThemeGraph,
  diagnostics: ThemeDiagnostic[],
): VuetifyTargetModel {
  const themes: Partial<Record<"light" | "dark", VuetifyThemeModel>> = {};
  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareSchemeIds(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "vuetify.unsupported-scheme",
        message: `Vuetify generation supports authored light and dark schemes; ${JSON.stringify(scheme.id)} was not emitted.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    themes[scheme.id] = buildTheme(scheme, diagnostics);
  }

  const hasLight = themes.light !== undefined;
  const hasDark = themes.dark !== undefined;
  if (!hasLight) {
    diagnostics.push({
      severity: "info",
      code: "vuetify.missing-light-scheme",
      message: "No light theme definition was generated.",
      path: ["schemes"],
    });
  }
  if (!hasDark) {
    diagnostics.push({
      severity: "info",
      code: "vuetify.missing-dark-scheme",
      message: "No dark theme definition was generated.",
      path: ["schemes"],
    });
  }
  const defaultTheme =
    hasLight && hasDark
      ? "system"
      : hasLight
        ? "light"
        : hasDark
          ? "dark"
          : undefined;
  return { ...(defaultTheme === undefined ? {} : { defaultTheme }), themes };
}

function buildTheme(
  scheme: ResolvedScheme,
  diagnostics: ThemeDiagnostic[],
): VuetifyThemeModel {
  const colors: Record<string, string> = {};
  const variables: Record<string, string | number> = {};

  for (const role of Object.values(scheme.roles).sort((left, right) =>
    compareText(left.role, right.role),
  )) {
    if (!KNOWN_ROLES.has(role.role)) {
      diagnostics.push({
        severity: "warning",
        code: "vuetify.unsupported-role",
        message: `Semantic role ${JSON.stringify(role.role)} has no safe Vuetify mapping and was skipped.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
  }

  for (const mapping of ROLE_MAPPINGS) {
    const role = scheme.roles[mapping.source];
    if (role === undefined) continue;
    if (role.value.alpha !== 1) {
      diagnostics.push({
        severity: "error",
        code: "vuetify.alpha.unsupported",
        message: `Role ${JSON.stringify(mapping.source)} is translucent, but Vuetify appends component-specific opacity to theme color channels and cannot safely represent it.`,
        path: ["schemes", scheme.id, "roles", mapping.source],
      });
      continue;
    }
    const converted = colorToVuetify(role.value);
    if (converted.value === undefined) {
      diagnostics.push({
        severity: "error",
        code: "vuetify.unsupported-color-space",
        message: `Role ${JSON.stringify(mapping.source)} cannot be represented by Vuetify without an sRGB fallback.`,
        path: ["schemes", scheme.id, "roles", mapping.source],
      });
      continue;
    }
    if (converted.usedFallback) {
      diagnostics.push({
        severity: "info",
        code: "vuetify.color-fallback.used",
        message: `Role ${JSON.stringify(mapping.source)} uses its sRGB hex fallback for Vuetify.`,
        path: ["schemes", scheme.id, "roles", mapping.source],
      });
    }
    for (const target of mapping.colors ?? []) colors[target] = converted.value;
  }

  const divider = scheme.roles.divider;
  if (divider !== undefined) {
    const converted = colorToVuetifyBorder(divider.value);
    if (converted.value === undefined) {
      diagnostics.push({
        severity: "error",
        code: "vuetify.divider.unsupported-color-space",
        message:
          "The divider role cannot be converted to the RGB channels required by Vuetify's border-color variable.",
        path: ["schemes", scheme.id, "roles", "divider"],
      });
    } else {
      variables["border-color"] = converted.value;
      variables["border-opacity"] = divider.value.alpha;
      if (converted.usedFallback) {
        diagnostics.push({
          severity: "info",
          code: "vuetify.color-fallback.used",
          message: 'Role "divider" uses its sRGB hex fallback for Vuetify.',
          path: ["schemes", scheme.id, "roles", "divider"],
        });
      }
    }
  }
  return { dark: scheme.id === "dark", colors, variables };
}

function colorToVuetifyBorder(color: ResolvedColor): {
  readonly value?: string;
  readonly usedFallback: boolean;
} {
  const [first, second, third] = color.components;
  if (
    color.colorSpace === "srgb" &&
    isNumber(first) &&
    isNumber(second) &&
    isNumber(third)
  ) {
    return {
      value: rgbToHex([first, second, third]),
      usedFallback: false,
    };
  }
  if (
    color.colorSpace === "hsl" &&
    isNumber(first) &&
    isNumber(second) &&
    isNumber(third)
  ) {
    return {
      value: rgbToHex(hslToRgb(first, second, third)),
      usedFallback: false,
    };
  }
  if (isHexFallback(color.hex)) {
    return { value: color.hex.toLowerCase(), usedFallback: true };
  }
  return { usedFallback: false };
}

function rgbToHex(components: readonly [number, number, number]): string {
  return `#${components
    .map((component) => toHexByte(Math.round(clamp(component, 0, 1) * 255)))
    .join("")}`;
}

function hslToRgb(
  hue: number,
  saturationPercent: number,
  lightnessPercent: number,
): readonly [number, number, number] {
  const saturation = clamp(saturationPercent / 100, 0, 1);
  const lightness = clamp(lightnessPercent / 100, 0, 1);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const intermediate = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, intermediate, 0]
      : sector < 2
        ? [intermediate, chroma, 0]
        : sector < 3
          ? [0, chroma, intermediate]
          : sector < 4
            ? [0, intermediate, chroma]
            : sector < 5
              ? [intermediate, 0, chroma]
              : [chroma, 0, intermediate];
  const match = lightness - chroma / 2;
  return [red + match, green + match, blue + match];
}

function colorToVuetify(color: ResolvedColor): {
  readonly value?: string;
  readonly usedFallback: boolean;
} {
  const [first, second, third] = color.components;
  if (
    color.colorSpace === "hsl" &&
    isNumber(first) &&
    isNumber(second) &&
    isNumber(third)
  ) {
    const value = `${color.alpha === 1 ? "hsl" : "hsla"}(${formatNumber(first)}, ${formatNumber(second)}%, ${formatNumber(third)}%${color.alpha === 1 ? "" : `, ${formatNumber(color.alpha)}`})`;
    return { value, usedFallback: false };
  }
  if (isHexFallback(color.hex)) {
    return {
      value: withHexAlpha(color.hex.toLowerCase(), color.alpha),
      usedFallback: color.colorSpace !== "srgb",
    };
  }
  if (
    color.colorSpace === "srgb" &&
    isNumber(first) &&
    isNumber(second) &&
    isNumber(third)
  ) {
    const hex = `#${[first, second, third]
      .map((component) => toHexByte(Math.round(clamp(component, 0, 1) * 255)))
      .join("")}`;
    return { value: withHexAlpha(hex, color.alpha), usedFallback: false };
  }
  return { usedFallback: false };
}

function renderThemeModule(
  model: VuetifyTargetModel,
  exportName: string,
): string {
  const lines = [
    'import type { ThemeDefinition, VuetifyOptions } from "vuetify";',
    "",
  ];
  for (const id of ["light", "dark"] as const) {
    const theme = model.themes[id];
    if (theme === undefined) continue;
    lines.push(
      `export const ${id}Theme: ThemeDefinition = ${safeJson(theme)};`,
      "",
    );
  }
  const themeReferences = Object.keys(model.themes)
    .sort(compareSchemeIds)
    .map((id) => `${JSON.stringify(id)}: ${id}Theme`)
    .join(", ");
  const defaultThemeLine =
    model.defaultTheme === undefined
      ? ""
      : `  defaultTheme: ${JSON.stringify(model.defaultTheme)},\n`;
  lines.push(
    `export const ${exportName} = {`,
    defaultThemeLine.trimEnd(),
    `  themes: { ${themeReferences} },`,
    `} satisfies Exclude<VuetifyOptions["theme"], false | undefined>;`,
    "",
    `export default ${exportName};`,
    "",
  );
  return lines
    .filter((line, index) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizeIdentifier(value: string): string {
  let normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_$]+/g, "_");
  if (!/^[A-Za-z_$]/.test(normalized)) normalized = `_${normalized}`;
  if (normalized.length === 0 || normalized === "_")
    normalized = "themeOptions";
  if (
    RESERVED_IDENTIFIERS.has(normalized) ||
    RESERVED_EXPORTS.has(normalized)
  ) {
    normalized = `_${normalized}`;
  }
  return normalized;
}

function withHexAlpha(hex: string, alpha: number): string {
  return alpha === 1
    ? hex
    : `${hex}${toHexByte(Math.round(clamp(alpha, 0, 1) * 255))}`;
}

function toHexByte(value: number): string {
  return clamp(value, 0, 255).toString(16).padStart(2, "0");
}

function isHexFallback(value: string | undefined): value is string {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value);
}

function isNumber(value: number | "none"): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSchemeIds(left: string, right: string): number {
  const rank = (id: string): number =>
    id === "light" ? 0 : id === "dark" ? 1 : 2;
  return rank(left) - rank(right) || compareText(left, right);
}
