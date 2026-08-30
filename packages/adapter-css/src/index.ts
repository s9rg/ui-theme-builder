import { safeParseJsonValue } from "@s9rg/theme-compiler";
import type {
  JsonValue,
  ResolvedColor,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
} from "@s9rg/theme-compiler";

export interface CssAdapterOptions {
  /** Namespace for generated custom properties. Defaults to `theme`. */
  readonly prefix?: string;
  /** Simple class or data-attribute selector used for the dark scheme. */
  readonly darkSelector?: string;
}

export interface CssAdapterPreviewOverride {
  readonly selector: string;
  readonly variables: Readonly<Record<string, string>>;
}

export interface CssAdapterPreview {
  readonly kind: "css-custom-properties";
  readonly version: "1";
  readonly prefix: string;
  readonly primitives: Readonly<Record<string, string>>;
  readonly schemes: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly runtime: {
    readonly root: {
      readonly selector: ":root";
      readonly scheme?: string;
      readonly variables: Readonly<Record<string, string>>;
    };
    readonly overrides: Readonly<Record<string, CssAdapterPreviewOverride>>;
  };
}

export type CssAdapterPreviewParseResult =
  | { readonly success: true; readonly preview: CssAdapterPreview }
  | { readonly success: false; readonly issues: readonly string[] };

export const cssAdapterManifest = {
  id: "css@1",
  name: "CSS custom properties",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "CSS Custom Properties",
    version: "1",
  },
  capabilities: {
    colors: { native: "passthrough", fallback: "none" },
    schemes: { count: "multiple", ids: "any" },
    roles: { requirement: "optional", supported: "any", required: [] },
    preview: true,
  },
  options: {
    prefix: {
      type: "string",
      default: "theme",
      description: "Namespace for generated custom properties.",
      format: "css-variable-prefix",
    },
    darkSelector: {
      type: "string",
      default: '[data-theme="dark"]',
      description: "Selector used to activate the dark scheme.",
      format: "css-selector",
    },
  },
} as const satisfies ThemeAdapterManifest;

interface CssSchemeModel {
  readonly id: string;
  readonly name: string;
  readonly variables: Readonly<Record<string, string>>;
}

interface CssTargetModel {
  readonly prefix: string;
  readonly primitiveVariables: Readonly<Record<string, string>>;
  readonly schemes: readonly CssSchemeModel[];
}

interface CssRuntimeOverride {
  readonly scheme: string;
  readonly selector: string;
  readonly variables: Readonly<Record<string, string>>;
}

interface CssRuntimeModel {
  readonly defaultScheme?: CssSchemeModel;
  readonly rootVariables: Readonly<Record<string, string>>;
  readonly overrides: readonly CssRuntimeOverride[];
}

const DEFAULT_DARK_SELECTOR = '[data-theme="dark"]';

export function createCssAdapter(
  options: CssAdapterOptions = {},
): ThemeAdapter {
  const requestedPrefix = options.prefix ?? "theme";
  const prefix = safeSegment(requestedPrefix, "theme");
  const requestedDarkSelector = options.darkSelector ?? DEFAULT_DARK_SELECTOR;
  const darkSelector = isSafeThemeSelector(requestedDarkSelector)
    ? requestedDarkSelector
    : DEFAULT_DARK_SELECTOR;

  return {
    manifest: cssAdapterManifest,
    configuration: Object.freeze({ prefix, darkSelector }),
    compile(graph, context) {
      context.signal?.throwIfAborted();

      const diagnostics: ThemeDiagnostic[] = [];

      if (prefix !== requestedPrefix) {
        diagnostics.push({
          severity: "warning",
          code: "css.prefix.normalized",
          message: `The custom-property prefix was normalized to ${JSON.stringify(prefix)}.`,
        });
      }
      const model = buildTargetModel(graph, prefix);
      const darkSelector = resolveDarkSelector(
        model,
        requestedDarkSelector,
        diagnostics,
      );
      addSchemeDiagnostics(model, diagnostics);
      const content = renderCss(model, darkSelector);

      context.signal?.throwIfAborted();

      return {
        artifacts: [{ path: "theme.css", mediaType: "text/css", content }],
        diagnostics,
        preview: buildPreview(model, darkSelector),
      };
    },
  };
}

function buildTargetModel(graph: ThemeGraph, prefix: string): CssTargetModel {
  const primitiveNames = allocateNames(
    graph.primitives.map((primitive) => primitive.id),
    "color",
    stripPaletteNamespace,
  );
  const roleNames = allocateNames(
    graph.schemes.flatMap((scheme) => Object.keys(scheme.roles)),
    "role",
  );
  const schemeNames = allocateNames(
    graph.schemes.map((scheme) => scheme.id),
    "scheme",
  );

  const primitiveVariables = Object.fromEntries(
    [...graph.primitives]
      .sort((left, right) => compareText(left.id, right.id))
      .map((primitive) => [
        `--${prefix}-palette-${requireValue(primitiveNames.get(primitive.id), "primitive name")}`,
        colorToCss(primitive.value),
      ]),
  );

  const schemes = [...graph.schemes]
    .sort((left, right) => compareText(left.id, right.id))
    .map((scheme) => ({
      id: scheme.id,
      name: requireValue(schemeNames.get(scheme.id), "scheme name"),
      variables: Object.fromEntries(
        Object.values(scheme.roles)
          .sort((left, right) => compareText(left.role, right.role))
          .map((role) => [
            `--${prefix}-semantic-${requireValue(roleNames.get(role.role), "role name")}`,
            colorToCss(role.value),
          ]),
      ),
    }));

  return { prefix, primitiveVariables, schemes };
}

function renderCss(model: CssTargetModel, darkSelector: string): string {
  const lines = ["/* Generated by @s9rg/theme-adapter-css. */"];
  const runtime = buildRuntimeModel(model, darkSelector);

  if (Object.keys(runtime.rootVariables).length > 0) {
    lines.push("", renderBlock(":root", runtime.rootVariables));
  }

  for (const override of runtime.overrides) {
    lines.push("", renderBlock(override.selector, override.variables));
  }

  return `${lines.join("\n")}\n`;
}

function renderBlock(
  selector: string,
  variables: Readonly<Record<string, string>>,
): string {
  const declarations = Object.entries(variables)
    .sort(([left], [right]) => compareText(left, right))
    .map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${declarations.join("\n")}\n}`;
}

function buildPreview(model: CssTargetModel, darkSelector: string): JsonValue {
  const runtime = buildRuntimeModel(model, darkSelector);
  return {
    kind: "css-custom-properties",
    version: "1",
    prefix: model.prefix,
    primitives: model.primitiveVariables,
    schemes: Object.fromEntries(
      model.schemes.map((scheme) => [
        scheme.name,
        {
          ...runtime.rootVariables,
          ...(scheme === runtime.defaultScheme ? {} : scheme.variables),
        },
      ]),
    ),
    runtime: {
      root: {
        selector: ":root",
        ...(runtime.defaultScheme === undefined
          ? {}
          : { scheme: runtime.defaultScheme.name }),
        variables: runtime.rootVariables,
      },
      overrides: Object.fromEntries(
        runtime.overrides.map((override) => [
          override.scheme,
          { selector: override.selector, variables: override.variables },
        ]),
      ),
    },
  };
}

/** Runtime validator for the versioned CSS adapter preview payload. */
export function safeParseCssAdapterPreview(
  input: unknown,
): CssAdapterPreviewParseResult {
  const parsed = safeParseJsonValue(input);
  if (!parsed.success) return { success: false, issues: parsed.issues };
  const value = parsed.value;
  const issues: string[] = [];
  if (!isPlainRecord(value)) {
    return { success: false, issues: ["preview must be a plain object"] };
  }
  if (
    !hasOnlyKeys(value, [
      "kind",
      "version",
      "prefix",
      "primitives",
      "schemes",
      "runtime",
    ])
  ) {
    issues.push("preview contains unknown fields");
  }
  if (value.kind !== "css-custom-properties")
    issues.push("kind is not supported");
  if (value.version !== "1") issues.push("version is not supported");
  if (
    typeof value.prefix !== "string" ||
    value.prefix.length === 0 ||
    value.prefix.length > 128
  ) {
    issues.push("prefix must be 1–128 characters");
  }
  if (!isStringRecord(value.primitives))
    issues.push("primitives must map names to strings");
  if (!isNestedStringRecord(value.schemes))
    issues.push("schemes must map names to string maps");
  if (
    !isPlainRecord(value.runtime) ||
    !hasOnlyKeys(value.runtime, ["root", "overrides"])
  ) {
    issues.push("runtime is invalid");
  } else {
    const root = value.runtime.root;
    if (
      !isPlainRecord(root) ||
      !hasOnlyKeys(root, ["selector", "scheme", "variables"]) ||
      root.selector !== ":root" ||
      (root.scheme !== undefined && typeof root.scheme !== "string") ||
      !isStringRecord(root.variables)
    ) {
      issues.push("runtime.root is invalid");
    }
    const overrides = value.runtime.overrides;
    if (!isPlainRecord(overrides)) {
      issues.push("runtime.overrides must be an object");
    } else {
      for (const override of Object.values(overrides)) {
        if (
          !isPlainRecord(override) ||
          !hasOnlyKeys(override, ["selector", "variables"]) ||
          typeof override.selector !== "string" ||
          !isStringRecord(override.variables)
        ) {
          issues.push("runtime override is invalid");
          break;
        }
      }
    }
  }
  return issues.length === 0
    ? { success: true, preview: value as unknown as CssAdapterPreview }
    : { success: false, issues };
}

function buildRuntimeModel(
  model: CssTargetModel,
  darkSelector: string,
): CssRuntimeModel {
  const defaultScheme =
    model.schemes.find((scheme) => scheme.id === "light") ?? model.schemes[0];
  const rootVariables = {
    ...model.primitiveVariables,
    ...(defaultScheme?.variables ?? {}),
  };
  const overrides = model.schemes
    .filter((scheme) => scheme !== defaultScheme)
    .map((scheme) => ({
      scheme: scheme.name,
      selector:
        scheme.id === "dark" ? darkSelector : `[data-theme="${scheme.name}"]`,
      variables: scheme.variables,
    }));
  return {
    ...(defaultScheme === undefined ? {} : { defaultScheme }),
    rootVariables,
    overrides,
  };
}

function resolveDarkSelector(
  model: CssTargetModel,
  requested: string,
  diagnostics: ThemeDiagnostic[],
): string {
  if (!isSafeThemeSelector(requested)) {
    diagnostics.push({
      severity: "warning",
      code: "css.dark-selector.rejected",
      message: `The dark selector was unsafe; ${JSON.stringify(DEFAULT_DARK_SELECTOR)} was used instead.`,
    });
    return DEFAULT_DARK_SELECTOR;
  }

  const defaultScheme =
    model.schemes.find((scheme) => scheme.id === "light") ?? model.schemes[0];
  const generatedSelectors = new Set(
    model.schemes
      .filter((scheme) => scheme !== defaultScheme && scheme.id !== "dark")
      .map((scheme) => `[data-theme="${scheme.name}"]`),
  );

  if (!generatedSelectors.has(requested)) return requested;
  diagnostics.push({
    severity: "warning",
    code: "css.dark-selector.conflict",
    message: `The dark selector matched another generated scheme selector; ${JSON.stringify(DEFAULT_DARK_SELECTOR)} was used instead.`,
  });
  return DEFAULT_DARK_SELECTOR;
}

function addSchemeDiagnostics(
  model: CssTargetModel,
  diagnostics: ThemeDiagnostic[],
): void {
  if (model.schemes.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "css.no-schemes",
      message:
        "No semantic schemes were supplied; only primitive variables were generated.",
      path: ["schemes"],
    });
    return;
  }

  if (!model.schemes.some((scheme) => scheme.id === "light")) {
    diagnostics.push({
      severity: "info",
      code: "css.missing-light-scheme",
      message:
        "No light scheme was supplied; the first scheme was used for :root.",
      path: ["schemes"],
    });
  }
  if (!model.schemes.some((scheme) => scheme.id === "dark")) {
    diagnostics.push({
      severity: "info",
      code: "css.missing-dark-scheme",
      message:
        "No dark scheme was supplied; no dark selector block was generated.",
      path: ["schemes"],
    });
  }

  const allVariables = new Set(
    model.schemes.flatMap((scheme) => Object.keys(scheme.variables)),
  );
  for (const scheme of model.schemes) {
    const missing = [...allVariables].filter(
      (variable) => !(variable in scheme.variables),
    );
    if (missing.length > 0) {
      diagnostics.push({
        severity: "info",
        code: "css.scheme-role.gap",
        message: `Scheme ${JSON.stringify(scheme.id)} omits ${missing.length} semantic role${missing.length === 1 ? "" : "s"}; inherited values may apply.`,
        path: ["schemes", scheme.id, "roles"],
      });
    }
  }
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

function isSafeThemeSelector(value: string): boolean {
  return (
    /^\.[A-Za-z_][A-Za-z0-9_-]*$/.test(value) ||
    /^\[data-[a-z0-9_-]+="[a-z0-9_-]+"\]$/i.test(value)
  );
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

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length <= 2_048 &&
    Object.values(value).every(
      (entry) => typeof entry === "string" && entry.length <= 4_096,
    )
  );
}

function isNestedStringRecord(
  value: unknown,
): value is Record<string, Record<string, string>> {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length <= 128 &&
    Object.values(value).every(isStringRecord)
  );
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
  for (const { base } of entries) counts.set(base, (counts.get(base) ?? 0) + 1);

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
  return ["__proto__", "constructor", "prototype"].includes(candidate)
    ? `${fallback}-${candidate.replace(/^_+|_+$/g, "")}`
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
