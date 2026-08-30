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

export interface DaisyUiAdapterPreviewTheme {
  readonly colorScheme: "light" | "dark";
  readonly variables: Readonly<Record<string, string>>;
}

export interface DaisyUiAdapterPreview {
  readonly kind: "daisyui-theme";
  readonly targetVersion: "5";
  readonly themes: Readonly<
    Partial<Record<"light" | "dark", DaisyUiAdapterPreviewTheme>>
  >;
}

export type DaisyUiAdapterPreviewParseResult =
  | { readonly success: true; readonly preview: DaisyUiAdapterPreview }
  | { readonly success: false; readonly issues: readonly string[] };

export const DAISYUI_SUPPORTED_ROLES = [
  "surface",
  "background",
  "divider",
  "foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "neutral",
  "neutral-foreground",
  "info",
  "info-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "error",
  "error-foreground",
] as const;

export const daisyUiAdapterManifest = {
  id: "daisyui@5",
  name: "daisyUI v5",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "daisyui",
    version: ">=5 <6",
  },
  capabilities: {
    colors: { native: "passthrough", fallback: "none" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "optional",
      supported: DAISYUI_SUPPORTED_ROLES,
      required: [],
    },
    preview: true,
  },
  options: {},
} as const satisfies ThemeAdapterManifest;

type DaisyUiSchemeId = "light" | "dark";

interface RoleMapping {
  readonly role: (typeof DAISYUI_SUPPORTED_ROLES)[number];
  readonly variable: `--color-${string}`;
}

const ROLE_MAPPINGS: readonly RoleMapping[] = [
  { role: "surface", variable: "--color-base-100" },
  { role: "background", variable: "--color-base-200" },
  { role: "divider", variable: "--color-base-300" },
  { role: "foreground", variable: "--color-base-content" },
  { role: "primary", variable: "--color-primary" },
  { role: "primary-foreground", variable: "--color-primary-content" },
  { role: "secondary", variable: "--color-secondary" },
  {
    role: "secondary-foreground",
    variable: "--color-secondary-content",
  },
  { role: "accent", variable: "--color-accent" },
  { role: "accent-foreground", variable: "--color-accent-content" },
  { role: "neutral", variable: "--color-neutral" },
  { role: "neutral-foreground", variable: "--color-neutral-content" },
  { role: "info", variable: "--color-info" },
  { role: "info-foreground", variable: "--color-info-content" },
  { role: "success", variable: "--color-success" },
  { role: "success-foreground", variable: "--color-success-content" },
  { role: "warning", variable: "--color-warning" },
  { role: "warning-foreground", variable: "--color-warning-content" },
  { role: "error", variable: "--color-error" },
  { role: "error-foreground", variable: "--color-error-content" },
] as const;

const KNOWN_ROLES = new Set<string>(DAISYUI_SUPPORTED_ROLES);

export function createDaisyUiAdapter(): ThemeAdapter {
  return {
    manifest: daisyUiAdapterManifest,
    configuration: Object.freeze({}),
    compile(graph, context) {
      context.signal?.throwIfAborted();
      const diagnostics: ThemeDiagnostic[] = [];
      const themes = buildThemes(graph, diagnostics);
      const content = renderThemeCss(themes);
      context.signal?.throwIfAborted();
      return {
        artifacts: [
          {
            path: "daisyui/theme.css",
            mediaType: "text/css",
            content,
          },
        ],
        diagnostics,
        preview: {
          kind: "daisyui-theme",
          targetVersion: "5",
          themes,
        } as unknown as JsonValue,
      };
    },
  };
}

/** Runtime validator for the versioned daisyUI preview payload. */
export function safeParseDaisyUiAdapterPreview(
  input: unknown,
): DaisyUiAdapterPreviewParseResult {
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
  if (value.kind !== "daisyui-theme") issues.push("kind is not supported");
  if (value.targetVersion !== "5")
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
        !hasOnlyKeys(theme, ["colorScheme", "variables"]) ||
        theme.colorScheme !== scheme ||
        !isSafeVariableRecord(theme.variables)
      ) {
        issues.push("theme override is invalid");
        break;
      }
    }
  }
  return issues.length === 0
    ? { success: true, preview: value as unknown as DaisyUiAdapterPreview }
    : { success: false, issues };
}

function buildThemes(
  graph: ThemeGraph,
  diagnostics: ThemeDiagnostic[],
): Partial<Record<DaisyUiSchemeId, DaisyUiAdapterPreviewTheme>> {
  const supported = new Map<DaisyUiSchemeId, ResolvedScheme>();
  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareText(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "daisyui.unsupported-scheme",
        message: `daisyUI v5 generation supports only light and dark theme overrides; ${JSON.stringify(scheme.id)} was skipped.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    supported.set(scheme.id, scheme);
  }

  const themes: Partial<Record<DaisyUiSchemeId, DaisyUiAdapterPreviewTheme>> =
    {};
  for (const schemeId of ["light", "dark"] as const) {
    const scheme = supported.get(schemeId);
    if (scheme === undefined) continue;
    themes[schemeId] = {
      colorScheme: schemeId,
      variables: buildVariables(scheme, diagnostics),
    };
  }

  addSchemeDiagnostics(supported, diagnostics);
  if (supported.size > 0) {
    diagnostics.push({
      severity: "info",
      code: "daisyui.builtin-inheritance",
      message:
        "The generated light and dark blocks override daisyUI's built-in themes; unbound daisyUI variables intentionally inherit their built-in values.",
      path: ["schemes"],
    });
  }
  return themes;
}

function buildVariables(
  scheme: ResolvedScheme,
  diagnostics: ThemeDiagnostic[],
): Readonly<Record<string, string>> {
  for (const role of Object.values(scheme.roles).sort((left, right) =>
    compareText(left.role, right.role),
  )) {
    if (role.role === "muted-foreground") {
      diagnostics.push({
        severity: "info",
        code: "daisyui.muted-foreground.omitted",
        message:
          "daisyUI represents muted content with base-content opacity, so muted-foreground was not assigned to a different semantic color.",
        path: ["schemes", scheme.id, "roles", role.role],
      });
    } else if (!KNOWN_ROLES.has(role.role)) {
      diagnostics.push({
        severity: "warning",
        code: "daisyui.unsupported-role",
        message: `Semantic role ${JSON.stringify(role.role)} has no safe daisyUI color-variable mapping and was skipped.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
  }

  const variables: Record<string, string> = {};
  for (const mapping of ROLE_MAPPINGS) {
    const role = scheme.roles[mapping.role];
    if (role !== undefined) {
      variables[mapping.variable] = colorToCss(role.value);
    }
  }
  return Object.fromEntries(
    Object.entries(variables).sort(([left], [right]) =>
      compareText(left, right),
    ),
  );
}

function addSchemeDiagnostics(
  supported: ReadonlyMap<DaisyUiSchemeId, ResolvedScheme>,
  diagnostics: ThemeDiagnostic[],
): void {
  if (supported.size === 0) {
    diagnostics.push({
      severity: "warning",
      code: "daisyui.no-supported-schemes",
      message:
        "No light or dark scheme was supplied; only daisyUI's built-in themes are enabled.",
      path: ["schemes"],
    });
    return;
  }
  if (!supported.has("light")) {
    diagnostics.push({
      severity: "info",
      code: "daisyui.missing-light-scheme",
      message: "The built-in light theme is enabled without custom overrides.",
      path: ["schemes"],
    });
  }
  if (!supported.has("dark")) {
    diagnostics.push({
      severity: "info",
      code: "daisyui.missing-dark-scheme",
      message: "The built-in dark theme is enabled without custom overrides.",
      path: ["schemes"],
    });
  }
}

function renderThemeCss(
  themes: Readonly<
    Partial<Record<DaisyUiSchemeId, DaisyUiAdapterPreviewTheme>>
  >,
): string {
  const lines = [
    "/* Generated by @s9rg/theme-adapter-daisyui. */",
    '@import "tailwindcss";',
    "",
    '@plugin "daisyui" {',
    "  themes: light --default, dark --prefersdark;",
    "}",
  ];

  for (const schemeId of ["light", "dark"] as const) {
    const theme = themes[schemeId];
    if (theme === undefined) continue;
    lines.push(
      "",
      '@plugin "daisyui/theme" {',
      `  name: "${schemeId}";`,
      `  default: ${schemeId === "light" ? "true" : "false"};`,
      `  prefersdark: ${schemeId === "dark" ? "true" : "false"};`,
      `  color-scheme: ${theme.colorScheme};`,
      ...Object.entries(theme.variables).map(
        ([name, value]) => `  ${name}: ${value};`,
      ),
      "}",
    );
  }
  return `${lines.join("\n")}\n`;
}

function colorToCss(color: ResolvedColor): string {
  const first = formatComponent(color.components[0]);
  const second = formatComponent(color.components[1]);
  const third = formatComponent(color.components[2]);
  const alpha = formatNumber(color.alpha);
  const suffix = color.alpha === 1 ? "" : ` / ${alpha}`;

  switch (color.colorSpace) {
    case "hsl":
      return `hsl(${first} ${percent(second)} ${percent(third)}${suffix})`;
    case "hwb":
      return `hwb(${first} ${percent(second)} ${percent(third)}${suffix})`;
    case "lab":
      return `lab(${percent(first)} ${second} ${third}${suffix})`;
    case "lch":
      return `lch(${percent(first)} ${second} ${third}${suffix})`;
    case "oklab":
      return `oklab(${first} ${second} ${third}${suffix})`;
    case "oklch":
      return `oklch(${first} ${second} ${third}${suffix})`;
    default:
      return `color(${safeColorSpace(color.colorSpace)} ${first} ${second} ${third}${suffix})`;
  }
}

function formatComponent(value: ResolvedColor["components"][number]): string {
  return value === "none" ? "none" : formatNumber(value);
}

function percent(value: string): string {
  return value === "none" ? value : `${value}%`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function safeColorSpace(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return safe.length === 0 ? "srgb" : safe;
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

function isSafeVariableRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length <= 64 &&
    Object.entries(value).every(
      ([name, entry]) =>
        /^--color-[a-z0-9-]+$/.test(name) &&
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.length <= 128 &&
        !/[;{}]|url\s*\(/i.test(entry),
    )
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
