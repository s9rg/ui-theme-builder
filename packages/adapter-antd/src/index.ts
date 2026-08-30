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

export interface AntdAdapterOptions {
  /** Identifier used for the named theme-map export. Defaults to `themes`. */
  readonly exportName?: string;
}

export interface AntdAdapterPreviewTheme {
  readonly algorithm: "default" | "dark";
  readonly token: Readonly<Record<string, string>>;
}

export interface AntdAdapterPreview {
  readonly kind: "antd-theme-configs";
  readonly targetVersion: "6";
  readonly themes: Readonly<
    Partial<Record<"light" | "dark", AntdAdapterPreviewTheme>>
  >;
}

export type AntdAdapterPreviewParseResult =
  | { readonly success: true; readonly preview: AntdAdapterPreview }
  | { readonly success: false; readonly issues: readonly string[] };

export const ANTD_SUPPORTED_ROLES = [
  "primary",
  "primary-foreground",
  "background",
  "surface",
  "foreground",
  "muted-foreground",
  "divider",
  "link",
  "error",
  "warning",
  "info",
  "success",
] as const;

export const antdAdapterManifest = {
  id: "antd@6",
  name: "Ant Design v6",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "antd",
    version: ">=6 <7",
  },
  capabilities: {
    colors: { native: ["srgb", "hsl"], fallback: "srgb-hex" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "optional",
      supported: ANTD_SUPPORTED_ROLES,
      required: [],
    },
    preview: true,
  },
  options: {
    exportName: {
      type: "string",
      default: "themes",
      description: "Identifier used for the named Ant Design theme map.",
      format: "identifier",
    },
  },
} as const satisfies ThemeAdapterManifest;

type AntdSchemeId = "light" | "dark";

interface AntdThemeModel {
  readonly algorithm: "default" | "dark";
  readonly token: Readonly<Record<string, string>>;
}

interface AntdTargetModel {
  readonly themes: Readonly<Partial<Record<AntdSchemeId, AntdThemeModel>>>;
}

interface RoleMapping {
  readonly role: (typeof ANTD_SUPPORTED_ROLES)[number];
  readonly tokens: readonly string[];
}

const ROLE_MAPPINGS: readonly RoleMapping[] = [
  { role: "primary", tokens: ["colorPrimary"] },
  { role: "primary-foreground", tokens: ["colorTextLightSolid"] },
  { role: "background", tokens: ["colorBgBase", "colorBgLayout"] },
  { role: "surface", tokens: ["colorBgContainer", "colorBgElevated"] },
  { role: "foreground", tokens: ["colorTextBase", "colorText"] },
  { role: "muted-foreground", tokens: ["colorTextSecondary"] },
  { role: "divider", tokens: ["colorBorder", "colorSplit"] },
  { role: "link", tokens: ["colorLink"] },
  { role: "error", tokens: ["colorError"] },
  { role: "warning", tokens: ["colorWarning"] },
  { role: "info", tokens: ["colorInfo"] },
  { role: "success", tokens: ["colorSuccess"] },
] as const;

const KNOWN_ROLES = new Set<string>(ANTD_SUPPORTED_ROLES);
const KNOWN_TARGET_TOKENS = new Set<string>(
  ROLE_MAPPINGS.flatMap(({ tokens }) => tokens),
);
const RESERVED_IDENTIFIERS = new Set([
  "ThemeConfig",
  "antdTheme",
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

export function createAntdAdapter(
  options: AntdAdapterOptions = {},
): ThemeAdapter {
  const requestedExportName = options.exportName ?? "themes";
  const exportName = normalizeIdentifier(requestedExportName);

  return {
    manifest: antdAdapterManifest,
    configuration: Object.freeze({ exportName }),
    compile(graph, context) {
      context.signal?.throwIfAborted();
      const diagnostics: ThemeDiagnostic[] = [];

      if (exportName !== requestedExportName) {
        diagnostics.push({
          severity: "warning",
          code: "antd.export-name.normalized",
          message: `The TypeScript export name was normalized to ${JSON.stringify(exportName)}.`,
        });
      }

      const model = buildTargetModel(graph, diagnostics);
      const content = renderThemeModule(model, exportName);
      context.signal?.throwIfAborted();

      return {
        artifacts: [
          {
            path: "antd/theme.ts",
            mediaType: "text/typescript",
            content,
          },
        ],
        diagnostics,
        preview: {
          kind: "antd-theme-configs",
          targetVersion: "6",
          themes: model.themes,
        } as unknown as JsonValue,
      };
    },
  };
}

/** Runtime validator for the versioned Ant Design preview payload. */
export function safeParseAntdAdapterPreview(
  input: unknown,
): AntdAdapterPreviewParseResult {
  const parsed = safeParseJsonValue(input);
  if (!parsed.success) return { success: false, issues: parsed.issues };
  const value = parsed.value;
  const issues: string[] = [];
  if (!isPlainRecord(value)) {
    return { success: false, issues: ["preview must be a plain object"] };
  }
  if (!hasOnlyKeys(value, ["kind", "targetVersion", "themes"])) {
    issues.push("preview contains unknown fields");
  }
  if (value.kind !== "antd-theme-configs") issues.push("kind is not supported");
  if (value.targetVersion !== "6")
    issues.push("targetVersion is not supported");
  if (!isPlainRecord(value.themes)) {
    issues.push("themes must be an object");
  } else {
    for (const [scheme, theme] of Object.entries(value.themes)) {
      if (scheme !== "light" && scheme !== "dark") {
        issues.push("themes contains an unsupported scheme");
        break;
      }
      if (
        !isPlainRecord(theme) ||
        !hasOnlyKeys(theme, ["algorithm", "token"]) ||
        (theme.algorithm !== "default" && theme.algorithm !== "dark") ||
        !isSafeColorRecord(theme.token)
      ) {
        issues.push("theme config is invalid");
        break;
      }
    }
  }
  return issues.length === 0
    ? { success: true, preview: value as unknown as AntdAdapterPreview }
    : { success: false, issues };
}

function buildTargetModel(
  graph: ThemeGraph,
  diagnostics: ThemeDiagnostic[],
): AntdTargetModel {
  const supported = new Map<AntdSchemeId, ResolvedScheme>();
  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareText(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "antd.unsupported-scheme",
        message: `Ant Design v6 generation supports only light and dark schemes; ${JSON.stringify(scheme.id)} was skipped.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    supported.set(scheme.id, scheme);
  }

  const themes: Partial<Record<AntdSchemeId, AntdThemeModel>> = {};
  for (const schemeId of ["light", "dark"] as const) {
    const scheme = supported.get(schemeId);
    if (scheme === undefined) continue;
    themes[schemeId] = {
      algorithm: schemeId === "dark" ? "dark" : "default",
      token: buildTokens(scheme, diagnostics),
    };
  }

  addSchemeDiagnostics(supported, diagnostics);
  return { themes };
}

function buildTokens(
  scheme: ResolvedScheme,
  diagnostics: ThemeDiagnostic[],
): Readonly<Record<string, string>> {
  const tokens: Record<string, string> = {};

  for (const role of Object.values(scheme.roles).sort((left, right) =>
    compareText(left.role, right.role),
  )) {
    if (!KNOWN_ROLES.has(role.role)) {
      diagnostics.push({
        severity: "warning",
        code: "antd.unsupported-role",
        message: `Semantic role ${JSON.stringify(role.role)} has no safe Ant Design token mapping and was skipped.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
  }

  for (const mapping of ROLE_MAPPINGS) {
    const role = scheme.roles[mapping.role];
    if (role === undefined) continue;
    const converted = colorToAntd(role.value);
    if (converted.value === undefined) {
      diagnostics.push({
        severity: "error",
        code: "antd.unsupported-color-space",
        message: `Role ${JSON.stringify(role.role)} uses ${JSON.stringify(role.value.colorSpace)} without an sRGB fallback and cannot be emitted safely.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
      continue;
    }
    if (converted.usedFallback) {
      diagnostics.push({
        severity: "info",
        code: "antd.color-fallback.used",
        message: `Role ${JSON.stringify(role.role)} uses its sRGB hex fallback because Ant Design's color parser does not natively consume ${JSON.stringify(role.value.colorSpace)}.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
    for (const token of mapping.tokens) tokens[token] = converted.value;
  }

  return Object.fromEntries(
    Object.entries(tokens).sort(([left], [right]) => compareText(left, right)),
  );
}

function addSchemeDiagnostics(
  supported: ReadonlyMap<AntdSchemeId, ResolvedScheme>,
  diagnostics: ThemeDiagnostic[],
): void {
  if (supported.size === 0) {
    diagnostics.push({
      severity: "warning",
      code: "antd.no-supported-schemes",
      message:
        "No light or dark scheme was supplied; the generated map contains no Ant Design overrides.",
      path: ["schemes"],
    });
    return;
  }
  if (!supported.has("light")) {
    diagnostics.push({
      severity: "info",
      code: "antd.missing-light-scheme",
      message: "No light theme override was generated.",
      path: ["schemes"],
    });
  }
  if (!supported.has("dark")) {
    diagnostics.push({
      severity: "info",
      code: "antd.missing-dark-scheme",
      message: "No dark theme override was generated.",
      path: ["schemes"],
    });
  }
}

function renderThemeModule(model: AntdTargetModel, exportName: string): string {
  const entries = (["light", "dark"] as const)
    .flatMap((schemeId) => {
      const theme = model.themes[schemeId];
      return theme === undefined
        ? []
        : [
            `  ${schemeId}: {\n    algorithm: antdTheme.${theme.algorithm}Algorithm,\n    token: ${indentJson(theme.token, 4)},\n  },`,
          ];
    })
    .join("\n");
  return [
    'import type { ThemeConfig } from "antd";',
    'import { theme as antdTheme } from "antd";',
    "",
    `export const ${exportName} = {`,
    entries,
    '} satisfies Partial<Record<"light" | "dark", ThemeConfig>>;',
    "",
    `export default ${exportName};`,
    "",
  ].join("\n");
}

function indentJson(value: unknown, spaces: number): string {
  const indent = " ".repeat(spaces);
  return safeJson(value)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join("\n");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function colorToAntd(color: ResolvedColor): {
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

function isSafeColorRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length <= 128 &&
    Object.entries(value).every(
      ([key, entry]) =>
        key.length <= 64 &&
        KNOWN_TARGET_TOKENS.has(key) &&
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.length <= 128 &&
        !/[;{}]|url\s*\(/i.test(entry),
    )
  );
}

function normalizeIdentifier(value: string): string {
  let normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_$]+/g, "_");
  if (!/^[A-Za-z_$]/.test(normalized)) normalized = `_${normalized}`;
  if (normalized.length === 0 || normalized === "_") normalized = "themes";
  if (RESERVED_IDENTIFIERS.has(normalized)) normalized = `_${normalized}`;
  return normalized.slice(0, 128);
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
