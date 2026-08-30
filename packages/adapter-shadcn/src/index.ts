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

export interface ShadcnAdapterOptions {
  /** Registry item name. Defaults to `generated-theme`. */
  readonly itemName?: string;
}

export interface ShadcnAdapterPreview {
  readonly kind: "shadcn-registry-theme";
  readonly targetVersion: "4";
  readonly name: string;
  readonly cssVars: Readonly<
    Partial<Record<"light" | "dark", Readonly<Record<string, string>>>>
  >;
}

export type ShadcnAdapterPreviewParseResult =
  | { readonly success: true; readonly preview: ShadcnAdapterPreview }
  | { readonly success: false; readonly issues: readonly string[] };

export const SHADCN_SUPPORTED_ROLES = [
  "background",
  "foreground",
  "surface",
  "surface-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "divider",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-divider",
  "sidebar-ring",
] as const;

export const shadcnAdapterManifest = {
  id: "shadcn@4",
  name: "shadcn registry theme",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "shadcn",
    version: ">=4 <5",
  },
  capabilities: {
    colors: { native: ["srgb", "hsl", "oklch"], fallback: "srgb-hex" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "optional",
      supported: SHADCN_SUPPORTED_ROLES,
      required: [],
    },
    preview: true,
  },
  options: {
    itemName: {
      type: "string",
      default: "generated-theme",
      description: "Name stored in the generated shadcn registry item.",
      format: "file-stem",
    },
  },
} as const satisfies ThemeAdapterManifest;

type ShadcnSchemeId = "light" | "dark";

interface RoleMapping {
  readonly sourceRoles: readonly string[];
  readonly target: string;
}

const ROLE_MAPPINGS: readonly RoleMapping[] = [
  { sourceRoles: ["background"], target: "background" },
  { sourceRoles: ["foreground"], target: "foreground" },
  { sourceRoles: ["surface"], target: "card" },
  {
    sourceRoles: ["surface-foreground", "foreground"],
    target: "card-foreground",
  },
  { sourceRoles: ["surface"], target: "popover" },
  {
    sourceRoles: ["surface-foreground", "foreground"],
    target: "popover-foreground",
  },
  { sourceRoles: ["primary"], target: "primary" },
  { sourceRoles: ["primary-foreground"], target: "primary-foreground" },
  { sourceRoles: ["secondary"], target: "secondary" },
  {
    sourceRoles: ["secondary-foreground"],
    target: "secondary-foreground",
  },
  { sourceRoles: ["muted"], target: "muted" },
  { sourceRoles: ["muted-foreground"], target: "muted-foreground" },
  { sourceRoles: ["accent"], target: "accent" },
  { sourceRoles: ["accent-foreground"], target: "accent-foreground" },
  { sourceRoles: ["destructive"], target: "destructive" },
  {
    sourceRoles: ["destructive-foreground"],
    target: "destructive-foreground",
  },
  { sourceRoles: ["divider"], target: "border" },
  { sourceRoles: ["input"], target: "input" },
  { sourceRoles: ["ring"], target: "ring" },
  { sourceRoles: ["chart-1"], target: "chart-1" },
  { sourceRoles: ["chart-2"], target: "chart-2" },
  { sourceRoles: ["chart-3"], target: "chart-3" },
  { sourceRoles: ["chart-4"], target: "chart-4" },
  { sourceRoles: ["chart-5"], target: "chart-5" },
  { sourceRoles: ["sidebar"], target: "sidebar" },
  { sourceRoles: ["sidebar-foreground"], target: "sidebar-foreground" },
  { sourceRoles: ["sidebar-primary"], target: "sidebar-primary" },
  {
    sourceRoles: ["sidebar-primary-foreground"],
    target: "sidebar-primary-foreground",
  },
  { sourceRoles: ["sidebar-accent"], target: "sidebar-accent" },
  {
    sourceRoles: ["sidebar-accent-foreground"],
    target: "sidebar-accent-foreground",
  },
  { sourceRoles: ["sidebar-divider"], target: "sidebar-border" },
  { sourceRoles: ["sidebar-ring"], target: "sidebar-ring" },
] as const;

const KNOWN_ROLES = new Set<string>(SHADCN_SUPPORTED_ROLES);
const KNOWN_TARGET_VARIABLES = new Set<string>(
  ROLE_MAPPINGS.map(({ target }) => target),
);
const CORE_THEME_VARIABLES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
] as const;

export function createShadcnAdapter(
  options: ShadcnAdapterOptions = {},
): ThemeAdapter {
  const requestedItemName = options.itemName ?? "generated-theme";
  const itemName = normalizeItemName(requestedItemName);

  return {
    manifest: shadcnAdapterManifest,
    configuration: Object.freeze({ itemName }),
    compile(graph, context) {
      context.signal?.throwIfAborted();
      const diagnostics: ThemeDiagnostic[] = [];
      if (itemName !== requestedItemName) {
        diagnostics.push({
          severity: "warning",
          code: "shadcn.item-name.normalized",
          message: `The registry item name was normalized to ${JSON.stringify(itemName)}.`,
        });
      }

      const cssVars = buildCssVars(graph, diagnostics);
      const item = {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: itemName,
        type: "registry:theme",
        description: "Generated by @s9rg/theme-adapter-shadcn.",
        cssVars,
      } as const;
      const content = `${safeJson(item)}\n`;
      context.signal?.throwIfAborted();

      return {
        artifacts: [
          {
            path: "shadcn/theme.json",
            mediaType: "application/json",
            content,
          },
        ],
        diagnostics,
        preview: {
          kind: "shadcn-registry-theme",
          targetVersion: "4",
          name: itemName,
          cssVars,
        } as JsonValue,
      };
    },
  };
}

/** Runtime validator for the versioned shadcn preview payload. */
export function safeParseShadcnAdapterPreview(
  input: unknown,
): ShadcnAdapterPreviewParseResult {
  const parsed = safeParseJsonValue(input);
  if (!parsed.success) return { success: false, issues: parsed.issues };
  const value = parsed.value;
  const issues: string[] = [];
  if (!isPlainRecord(value)) {
    return { success: false, issues: ["preview must be a plain object"] };
  }
  if (!hasOnlyKeys(value, ["kind", "targetVersion", "name", "cssVars"])) {
    issues.push("preview contains unknown fields");
  }
  if (value.kind !== "shadcn-registry-theme")
    issues.push("kind is not supported");
  if (value.targetVersion !== "4")
    issues.push("targetVersion is not supported");
  if (
    typeof value.name !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.name)
  ) {
    issues.push("name is invalid");
  }
  if (!isSchemeColorRecord(value.cssVars)) {
    issues.push("cssVars is invalid");
  }
  return issues.length === 0
    ? { success: true, preview: value as unknown as ShadcnAdapterPreview }
    : { success: false, issues };
}

function buildCssVars(
  graph: ThemeGraph,
  diagnostics: ThemeDiagnostic[],
): Partial<Record<ShadcnSchemeId, Readonly<Record<string, string>>>> {
  const supported = new Map<ShadcnSchemeId, ResolvedScheme>();
  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareText(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "shadcn.unsupported-scheme",
        message: `shadcn registry themes support only light and dark CSS variable sets; ${JSON.stringify(scheme.id)} was skipped.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    supported.set(scheme.id, scheme);
  }

  const cssVars: Partial<
    Record<ShadcnSchemeId, Readonly<Record<string, string>>>
  > = {};
  for (const schemeId of ["light", "dark"] as const) {
    const scheme = supported.get(schemeId);
    if (scheme === undefined) continue;
    const variables = buildSchemeVariables(scheme, diagnostics);
    cssVars[schemeId] = variables;
    const missing = CORE_THEME_VARIABLES.filter(
      (variable) => !(variable in variables),
    );
    if (missing.length > 0) {
      diagnostics.push({
        severity: "info",
        code: "shadcn.partial-theme",
        message: `Scheme ${JSON.stringify(schemeId)} leaves ${missing.length} core shadcn variable${missing.length === 1 ? "" : "s"} unchanged when the registry item is installed.`,
        path: ["schemes", schemeId, "roles"],
      });
    }
  }

  addSchemeDiagnostics(supported, diagnostics);
  return cssVars;
}

function buildSchemeVariables(
  scheme: ResolvedScheme,
  diagnostics: ThemeDiagnostic[],
): Readonly<Record<string, string>> {
  for (const role of Object.values(scheme.roles).sort((left, right) =>
    compareText(left.role, right.role),
  )) {
    if (!KNOWN_ROLES.has(role.role)) {
      diagnostics.push({
        severity: "warning",
        code: "shadcn.unsupported-role",
        message: `Semantic role ${JSON.stringify(role.role)} has no safe shadcn theme-variable mapping and was skipped.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
  }

  const variables: Record<string, string> = {};
  for (const mapping of ROLE_MAPPINGS) {
    const candidates = mapping.sourceRoles.filter(
      (roleName) => roleName in scheme.roles,
    );
    if (candidates.length === 0) continue;
    const selected = requireValue(candidates[0], "shadcn role mapping");
    if (candidates.length > 1) {
      diagnostics.push({
        severity: "info",
        code: "shadcn.role-precedence",
        message: `Roles ${candidates.map((role) => JSON.stringify(role)).join(", ")} can populate ${JSON.stringify(mapping.target)}; ${JSON.stringify(selected)} was used.`,
        path: ["schemes", scheme.id, "roles"],
      });
    }
    const role = requireValue(scheme.roles[selected], "resolved role");
    const converted = colorToShadcn(role.value);
    if (converted.value === undefined) {
      diagnostics.push({
        severity: "error",
        code: "shadcn.color.unsupported",
        message: `Role ${JSON.stringify(selected)} uses ${JSON.stringify(role.value.colorSpace)}, which the shadcn v4 CLI cannot safely install, and no sRGB hex fallback is available.`,
        path: ["schemes", scheme.id, "roles", selected],
      });
      continue;
    }
    if (converted.usedFallback) {
      diagnostics.push({
        severity: "info",
        code: "shadcn.color-fallback.used",
        message: `Role ${JSON.stringify(selected)} was emitted using its sRGB hex fallback because the shadcn v4 CLI does not safely install ${JSON.stringify(role.value.colorSpace)} values.`,
        path: ["schemes", scheme.id, "roles", selected],
      });
    }
    variables[mapping.target] = converted.value;
  }

  return Object.fromEntries(
    Object.entries(variables).sort(([left], [right]) =>
      compareText(left, right),
    ),
  );
}

function addSchemeDiagnostics(
  supported: ReadonlyMap<ShadcnSchemeId, ResolvedScheme>,
  diagnostics: ThemeDiagnostic[],
): void {
  if (supported.size === 0) {
    diagnostics.push({
      severity: "warning",
      code: "shadcn.no-supported-schemes",
      message:
        "No light or dark scheme was supplied; the generated registry theme contains no CSS variable overrides.",
      path: ["schemes"],
    });
    return;
  }
  if (!supported.has("light")) {
    diagnostics.push({
      severity: "info",
      code: "shadcn.missing-light-scheme",
      message: "No light CSS variable set was generated.",
      path: ["schemes"],
    });
  }
  if (!supported.has("dark")) {
    diagnostics.push({
      severity: "info",
      code: "shadcn.missing-dark-scheme",
      message: "No dark CSS variable set was generated.",
      path: ["schemes"],
    });
  }
}

function colorToShadcn(color: ResolvedColor): {
  readonly value?: string;
  readonly usedFallback: boolean;
} {
  const first = formatComponent(color.components[0]);
  const second = formatComponent(color.components[1]);
  const third = formatComponent(color.components[2]);
  const alpha = formatNumber(color.alpha);
  const suffix = color.alpha === 1 ? "" : ` / ${alpha}`;

  switch (color.colorSpace) {
    case "hsl":
      return {
        value: `hsl(${first} ${percent(second)} ${percent(third)}${suffix})`,
        usedFallback: false,
      };
    case "oklch":
      return {
        value: `oklch(${first} ${second} ${third}${suffix})`,
        usedFallback: false,
      };
    case "srgb":
      return {
        value: `rgb(${unitPercent(color.components[0])} ${unitPercent(color.components[1])} ${unitPercent(color.components[2])}${suffix})`,
        usedFallback: false,
      };
    default: {
      if (!isHexFallback(color.hex)) return { usedFallback: false };
      return {
        value: hexWithAlpha(color.hex, color.alpha),
        usedFallback: true,
      };
    }
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (alpha === 1) return hex.toLowerCase();
  const alphaByte = Math.round(clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex.toLowerCase()}${alphaByte}`;
}

function isHexFallback(value: string | undefined): value is string {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizeItemName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return normalized.length === 0 ? "generated-theme" : normalized;
}

function formatComponent(value: ResolvedColor["components"][number]): string {
  return value === "none" ? "none" : formatNumber(value);
}

function percent(value: string): string {
  return value === "none" ? value : `${value}%`;
}

function unitPercent(value: ResolvedColor["components"][number]): string {
  return value === "none" ? value : `${formatNumber(value * 100)}%`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
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

function isSchemeColorRecord(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  for (const [scheme, variables] of Object.entries(value)) {
    if (
      (scheme !== "light" && scheme !== "dark") ||
      !isSafeColorRecord(variables)
    ) {
      return false;
    }
  }
  return true;
}

function isSafeColorRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length <= 128 &&
    Object.entries(value).every(
      ([key, entry]) =>
        key.length <= 64 &&
        KNOWN_TARGET_VARIABLES.has(key) &&
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

function requireValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(
      `Internal adapter invariant failed: missing ${description}.`,
    );
  }
  return value;
}
