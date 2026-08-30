import { safeParseJsonValue } from "@s9rg/theme-compiler";
import type {
  JsonValue,
  ResolvedColor,
  ResolvedScheme,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
} from "@s9rg/theme-compiler";

export interface MuiAdapterOptions {
  /** Identifier used for the named TypeScript export. Defaults to `theme`. */
  readonly exportName?: string;
}

export interface MuiAdapterPreviewPalette {
  readonly primary?: Readonly<Partial<Record<"main" | "contrastText", string>>>;
  readonly secondary?: Readonly<
    Partial<Record<"main" | "contrastText", string>>
  >;
  readonly error?: Readonly<Partial<Record<"main" | "contrastText", string>>>;
  readonly warning?: Readonly<Partial<Record<"main" | "contrastText", string>>>;
  readonly info?: Readonly<Partial<Record<"main" | "contrastText", string>>>;
  readonly success?: Readonly<Partial<Record<"main" | "contrastText", string>>>;
  readonly background?: Readonly<Partial<Record<"default" | "paper", string>>>;
  readonly text?: Readonly<Partial<Record<"primary" | "secondary", string>>>;
  readonly divider?: string;
}

export type MuiAdapterPreviewScheme =
  true | { readonly palette: MuiAdapterPreviewPalette };

export interface MuiAdapterPreviewThemeOptions {
  readonly cssVariables: { readonly colorSchemeSelector: "data" };
  readonly colorSchemes?: Readonly<
    Partial<Record<"light" | "dark", MuiAdapterPreviewScheme>>
  >;
}

export interface MuiAdapterPreview {
  readonly kind: "mui-theme-options";
  readonly targetVersion: "9";
  readonly themeOptions: MuiAdapterPreviewThemeOptions;
}

export type MuiAdapterPreviewParseResult =
  | { readonly success: true; readonly preview: MuiAdapterPreview }
  | { readonly success: false; readonly issues: readonly string[] };

export const MUI_SUPPORTED_ROLES = [
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

export const muiAdapterManifest = {
  id: "mui@9",
  name: "Material UI v9",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "@mui/material",
    version: ">=9 <10",
  },
  capabilities: {
    colors: { native: ["srgb", "hsl"], fallback: "srgb-hex" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "required",
      supported: MUI_SUPPORTED_ROLES,
      required: ["primary"],
    },
    preview: true,
  },
  options: {
    exportName: {
      type: "string",
      default: "theme",
      description: "Identifier used for the named TypeScript export.",
      format: "identifier",
    },
  },
} as const satisfies ThemeAdapterManifest;

type MuiSchemeId = "light" | "dark";
type MuiPath =
  | readonly [
      "primary" | "secondary" | "error" | "warning" | "info" | "success",
      "main" | "contrastText",
    ]
  | readonly ["background", "default" | "paper"]
  | readonly ["text", "primary" | "secondary"]
  | readonly ["divider"];

interface RoleMapping {
  readonly sourceRoles: readonly string[];
  readonly path: MuiPath;
  readonly requiresMain?: boolean;
}

interface MuiTargetModel {
  readonly themeOptions: JsonValue;
}

const ROLE_MAPPINGS: readonly RoleMapping[] = [
  { sourceRoles: ["primary"], path: ["primary", "main"] },
  {
    sourceRoles: ["primary-foreground"],
    path: ["primary", "contrastText"],
    requiresMain: true,
  },
  { sourceRoles: ["secondary"], path: ["secondary", "main"] },
  {
    sourceRoles: ["secondary-foreground"],
    path: ["secondary", "contrastText"],
    requiresMain: true,
  },
  { sourceRoles: ["error"], path: ["error", "main"] },
  {
    sourceRoles: ["error-foreground"],
    path: ["error", "contrastText"],
    requiresMain: true,
  },
  { sourceRoles: ["warning"], path: ["warning", "main"] },
  {
    sourceRoles: ["warning-foreground"],
    path: ["warning", "contrastText"],
    requiresMain: true,
  },
  { sourceRoles: ["info"], path: ["info", "main"] },
  {
    sourceRoles: ["info-foreground"],
    path: ["info", "contrastText"],
    requiresMain: true,
  },
  { sourceRoles: ["success"], path: ["success", "main"] },
  {
    sourceRoles: ["success-foreground"],
    path: ["success", "contrastText"],
    requiresMain: true,
  },
  { sourceRoles: ["background"], path: ["background", "default"] },
  { sourceRoles: ["surface"], path: ["background", "paper"] },
  { sourceRoles: ["foreground"], path: ["text", "primary"] },
  { sourceRoles: ["muted-foreground"], path: ["text", "secondary"] },
  { sourceRoles: ["divider"], path: ["divider"] },
] as const;

const KNOWN_ROLES = new Set<string>(MUI_SUPPORTED_ROLES);
const RESERVED_IDENTIFIERS = new Set([
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

export function createMuiAdapter(
  options: MuiAdapterOptions = {},
): ThemeAdapter {
  const requestedExportName = options.exportName ?? "theme";
  const exportName = normalizeIdentifier(requestedExportName);

  return {
    manifest: muiAdapterManifest,
    configuration: Object.freeze({ exportName }),
    compile(graph, context) {
      context.signal?.throwIfAborted();

      const diagnostics: ThemeDiagnostic[] = [];

      if (exportName !== requestedExportName) {
        diagnostics.push({
          severity: "warning",
          code: "mui.export-name.normalized",
          message: `The TypeScript export name was normalized to ${JSON.stringify(exportName)}.`,
        });
      }

      const model = buildTargetModel(graph, diagnostics);
      const source = renderThemeModule(model, exportName);

      context.signal?.throwIfAborted();

      return {
        artifacts: [
          {
            path: "theme.ts",
            mediaType: "text/typescript",
            content: source,
          },
        ],
        diagnostics,
        preview: {
          kind: "mui-theme-options",
          targetVersion: "9",
          themeOptions: model.themeOptions,
        } as JsonValue,
      };
    },
  };
}

/** Runtime validator for the versioned MUI adapter preview payload. */
export function safeParseMuiAdapterPreview(
  input: unknown,
): MuiAdapterPreviewParseResult {
  const parsed = safeParseJsonValue(input);
  if (!parsed.success) return { success: false, issues: parsed.issues };
  const value = parsed.value;
  const issues: string[] = [];
  if (!isPlainRecord(value)) {
    return { success: false, issues: ["preview must be a plain object"] };
  }
  if (!hasOnlyKeys(value, ["kind", "targetVersion", "themeOptions"])) {
    issues.push("preview contains unknown fields");
  }
  if (value.kind !== "mui-theme-options") issues.push("kind is not supported");
  if (value.targetVersion !== "9")
    issues.push("targetVersion is not supported");
  const themeOptions = value.themeOptions;
  if (
    !isPlainRecord(themeOptions) ||
    !hasOnlyKeys(themeOptions, ["cssVariables", "colorSchemes"])
  ) {
    issues.push("themeOptions is invalid");
  } else {
    const cssVariables = themeOptions.cssVariables;
    if (
      !isPlainRecord(cssVariables) ||
      !hasOnlyKeys(cssVariables, ["colorSchemeSelector"]) ||
      cssVariables.colorSchemeSelector !== "data"
    ) {
      issues.push("themeOptions.cssVariables is invalid");
    }
    const colorSchemes = themeOptions.colorSchemes;
    if (colorSchemes !== undefined) {
      if (
        !isPlainRecord(colorSchemes) ||
        Object.keys(colorSchemes).some(
          (scheme) => scheme !== "light" && scheme !== "dark",
        )
      ) {
        issues.push("themeOptions.colorSchemes is invalid");
      } else {
        for (const scheme of Object.values(colorSchemes)) {
          if (
            scheme !== true &&
            (!isPlainRecord(scheme) ||
              !hasOnlyKeys(scheme, ["palette"]) ||
              !isMuiPreviewPalette(scheme.palette))
          ) {
            issues.push("MUI color scheme is invalid");
            break;
          }
        }
      }
    }
  }
  return issues.length === 0
    ? { success: true, preview: value as unknown as MuiAdapterPreview }
    : { success: false, issues };
}

function buildTargetModel(
  graph: ThemeGraph,
  diagnostics: ThemeDiagnostic[],
): MuiTargetModel {
  const outputSchemes: Partial<Record<MuiSchemeId, JsonValue>> = {};
  const supportedSchemes = new Map<MuiSchemeId, ResolvedScheme>();

  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareText(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "mui.unsupported-scheme",
        message: `MUI v9 generation currently supports only light and dark schemes; ${JSON.stringify(scheme.id)} cannot be emitted without a target-specific module augmentation.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    supportedSchemes.set(scheme.id, scheme);
  }

  for (const schemeId of ["light", "dark"] as const) {
    const scheme = supportedSchemes.get(schemeId);
    if (scheme === undefined) continue;

    const palette = buildPalette(scheme, diagnostics);
    outputSchemes[schemeId] =
      Object.keys(palette).length === 0 ? true : { palette };

    if (!("primary" in scheme.roles)) {
      diagnostics.push({
        severity: "info",
        code: "mui.primary.defaulted",
        message: `Scheme ${JSON.stringify(schemeId)} has no explicit primary role; MUI's default primary palette is preserved.`,
        path: ["schemes", schemeId, "roles"],
      });
    }
  }

  if (supportedSchemes.size === 0) {
    diagnostics.push({
      severity: "warning",
      code: "mui.no-supported-schemes",
      message:
        "No light or dark scheme was supplied; createTheme receives no palette overrides.",
      path: ["schemes"],
    });
  } else {
    if (!supportedSchemes.has("light")) {
      diagnostics.push({
        severity: "info",
        code: "mui.missing-light-scheme",
        message:
          "No light scheme was supplied; MUI's light defaults remain available.",
        path: ["schemes"],
      });
    }
    if (!supportedSchemes.has("dark")) {
      diagnostics.push({
        severity: "info",
        code: "mui.missing-dark-scheme",
        message:
          "No dark scheme was supplied; no dark color-scheme override was generated.",
        path: ["schemes"],
      });
    }
  }

  const themeOptions: JsonValue =
    Object.keys(outputSchemes).length === 0
      ? { cssVariables: { colorSchemeSelector: "data" } }
      : {
          cssVariables: { colorSchemeSelector: "data" },
          colorSchemes: outputSchemes,
        };
  return { themeOptions };
}

function buildPalette(
  scheme: ResolvedScheme,
  diagnostics: ThemeDiagnostic[],
): Record<string, JsonValue> {
  const palette: Record<string, JsonValue> = {};

  for (const role of Object.values(scheme.roles).sort((left, right) =>
    compareText(left.role, right.role),
  )) {
    if (!KNOWN_ROLES.has(role.role)) {
      diagnostics.push({
        severity: "warning",
        code: "mui.unsupported-role",
        message: `Semantic role ${JSON.stringify(role.role)} has no safe MUI palette mapping and was skipped.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
  }

  for (const mapping of ROLE_MAPPINGS) {
    const candidates = mapping.sourceRoles.filter(
      (roleName) => roleName in scheme.roles,
    );
    if (candidates.length === 0) continue;

    const selectedRoleName = requireValue(candidates[0], "MUI role mapping");
    if (candidates.length > 1) {
      diagnostics.push({
        severity: "warning",
        code: "mui.role.collision",
        message: `Roles ${candidates.map((role) => JSON.stringify(role)).join(", ")} map to the same MUI token; ${JSON.stringify(selectedRoleName)} was used.`,
        path: ["schemes", scheme.id, "roles"],
      });
    }

    if (mapping.requiresMain === true) {
      const group = requireValue(mapping.path[0], "MUI palette group");
      const emittedGroup = palette[group];
      const hasEmittedMain =
        isJsonRecord(emittedGroup) && typeof emittedGroup.main === "string";
      if (!hasEmittedMain) {
        diagnostics.push({
          severity: "warning",
          code: "mui.contrast-without-main",
          message: `Role ${JSON.stringify(selectedRoleName)} was skipped because MUI requires a compatible explicit ${group} main color for this override.`,
          path: ["schemes", scheme.id, "roles", selectedRoleName],
        });
        continue;
      }
    }

    const role = requireValue(scheme.roles[selectedRoleName], "resolved role");
    const converted = colorToMui(role.value);
    if (converted.value === undefined) {
      diagnostics.push({
        severity: "error",
        code: "mui.unsupported-color-space",
        message: `Role ${JSON.stringify(selectedRoleName)} uses ${JSON.stringify(role.value.colorSpace)} without an sRGB fallback and cannot be emitted safely.`,
        path: ["schemes", scheme.id, "roles", selectedRoleName],
      });
      continue;
    }
    if (converted.usedFallback) {
      diagnostics.push({
        severity: "info",
        code: "mui.color-fallback.used",
        message: `Role ${JSON.stringify(selectedRoleName)} uses its sRGB hex fallback because MUI's default color parser does not support ${JSON.stringify(role.value.colorSpace)}.`,
        path: ["schemes", scheme.id, "roles", selectedRoleName],
      });
    }

    setMuiPath(palette, mapping.path, converted.value);
  }

  return palette;
}

function setMuiPath(
  target: Record<string, JsonValue>,
  path: MuiPath,
  value: string,
): void {
  if (path.length === 1) {
    target[path[0]] = value;
    return;
  }

  const [group, token] = path;
  const existing = target[group];
  const groupValue: Record<string, JsonValue> = isJsonRecord(existing)
    ? { ...existing }
    : {};
  groupValue[token] = value;
  target[group] = groupValue;
}

function colorToMui(color: ResolvedColor): {
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
    const hue = first;
    const saturation = second;
    const lightness = third;
    return {
      value:
        color.alpha === 1
          ? `hsl(${formatNumber(hue)}, ${formatNumber(saturation)}%, ${formatNumber(lightness)}%)`
          : `hsla(${formatNumber(hue)}, ${formatNumber(saturation)}%, ${formatNumber(lightness)}%, ${formatNumber(color.alpha)})`,
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
    const red = first;
    const green = second;
    const blue = third;
    const channels = [red, green, blue].map((channel) =>
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

function isHexFallback(value: string | undefined): value is string {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value);
}

function isNumber(value: number | "none"): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isSafePreviewColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[;{}]|url\s*\(/i.test(value)
  );
}

function isMuiPreviewPalette(
  value: unknown,
): value is MuiAdapterPreviewPalette {
  if (!isPlainRecord(value)) return false;
  const groupKeys = new Set([
    "primary",
    "secondary",
    "error",
    "warning",
    "info",
    "success",
  ]);
  for (const [key, entry] of Object.entries(value)) {
    if (key === "divider") {
      if (!isSafePreviewColor(entry)) return false;
      continue;
    }
    const allowedTokens = groupKeys.has(key)
      ? ["main", "contrastText"]
      : key === "background"
        ? ["default", "paper"]
        : key === "text"
          ? ["primary", "secondary"]
          : undefined;
    if (
      allowedTokens === undefined ||
      !isPlainRecord(entry) ||
      Object.keys(entry).length === 0 ||
      !hasOnlyKeys(entry, allowedTokens) ||
      !Object.values(entry).every(isSafePreviewColor)
    ) {
      return false;
    }
  }
  return true;
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

function renderThemeModule(model: MuiTargetModel, exportName: string): string {
  const themeOptions = JSON.stringify(model.themeOptions, null, 2)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return [
    'import { createTheme } from "@mui/material/styles";',
    "",
    `export const ${exportName} = createTheme(${themeOptions});`,
    "",
    `export default ${exportName};`,
    "",
  ].join("\n");
}

function normalizeIdentifier(value: string): string {
  let normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_$]+/g, "_");
  if (!/^[A-Za-z_$]/.test(normalized)) normalized = `_${normalized}`;
  if (normalized.length === 0 || normalized === "_") normalized = "theme";
  if (RESERVED_IDENTIFIERS.has(normalized)) normalized = `_${normalized}`;
  return normalized;
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
