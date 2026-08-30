import type {
  JsonValue,
  ResolvedColor,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
} from "@s9rg/theme-compiler";

export interface TailwindAdapterOptions {
  /** Namespace for semantic backing variables. Defaults to `theme`. */
  readonly prefix?: string;
  /** Simple class or data-attribute selector used for the dark scheme. */
  readonly darkSelector?: string;
}

export const tailwindAdapterManifest = {
  id: "tailwind@4",
  name: "Tailwind CSS v4",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: {
    name: "tailwindcss",
    version: ">=4 <5",
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
      description: "Namespace for semantic backing variables.",
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

interface TailwindSchemeModel {
  readonly id: string;
  readonly name: string;
  readonly variables: Readonly<Record<string, string>>;
}

interface TailwindTargetModel {
  readonly prefix: string;
  readonly primitiveVariables: Readonly<Record<string, string>>;
  readonly aliases: Readonly<Record<string, string>>;
  readonly schemes: readonly TailwindSchemeModel[];
}

interface TailwindRuntimeOverride {
  readonly scheme: string;
  readonly selector: string;
  readonly variables: Readonly<Record<string, string>>;
}

interface TailwindRuntimeModel {
  readonly defaultScheme?: TailwindSchemeModel;
  readonly rootVariables: Readonly<Record<string, string>>;
  readonly overrides: readonly TailwindRuntimeOverride[];
}

const DEFAULT_DARK_SELECTOR = '[data-theme="dark"]';

export function createTailwindAdapter(
  options: TailwindAdapterOptions = {},
): ThemeAdapter {
  const requestedPrefix = options.prefix ?? "theme";
  const prefix = safeSegment(requestedPrefix, "theme");
  const requestedDarkSelector = options.darkSelector ?? DEFAULT_DARK_SELECTOR;
  const darkSelector = isSafeThemeSelector(requestedDarkSelector)
    ? requestedDarkSelector
    : DEFAULT_DARK_SELECTOR;

  return {
    manifest: tailwindAdapterManifest,
    configuration: Object.freeze({ prefix, darkSelector }),
    compile(graph, context) {
      context.signal?.throwIfAborted();

      const diagnostics: ThemeDiagnostic[] = [];

      if (prefix !== requestedPrefix) {
        diagnostics.push({
          severity: "warning",
          code: "tailwind.prefix.normalized",
          message: `The semantic custom-property prefix was normalized to ${JSON.stringify(prefix)}.`,
        });
      }
      const model = buildTargetModel(graph, prefix);
      const darkSelector = resolveDarkSelector(
        model,
        requestedDarkSelector,
        diagnostics,
      );
      addSchemeDiagnostics(model, diagnostics);
      const content = renderTailwindTheme(model, darkSelector);

      context.signal?.throwIfAborted();

      return {
        artifacts: [
          { path: "theme.tailwind.css", mediaType: "text/css", content },
        ],
        diagnostics,
        preview: buildPreview(model, darkSelector),
      };
    },
  };
}

function buildTargetModel(
  graph: ThemeGraph,
  prefix: string,
): TailwindTargetModel {
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
        `--color-palette-${requireValue(primitiveNames.get(primitive.id), "primitive name")}`,
        colorToCss(primitive.value),
      ]),
  );
  const primitiveVariableNames = new Set(Object.keys(primitiveVariables));
  const aliasNames = new Map<string, string>();
  const usedVariableNames = new Set(primitiveVariableNames);

  for (const [role, safeRole] of [...roleNames].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    const candidate = `--color-${safeRole}`;
    const preferred = primitiveVariableNames.has(candidate)
      ? `${candidate}-${stableHash(role)}`
      : candidate;
    aliasNames.set(role, claimName(preferred, usedVariableNames));
  }

  const aliases = Object.fromEntries(
    [...aliasNames]
      .sort(([left], [right]) => compareText(left, right))
      .map(([, alias]) => {
        const safeRole = alias.slice("--color-".length);
        return [alias, `var(--${prefix}-semantic-${safeRole})`];
      }),
  );
  const schemes = [...graph.schemes]
    .sort((left, right) => compareText(left.id, right.id))
    .map((scheme) => ({
      id: scheme.id,
      name: requireValue(schemeNames.get(scheme.id), "scheme name"),
      variables: Object.fromEntries(
        Object.values(scheme.roles)
          .sort((left, right) => compareText(left.role, right.role))
          .map((role) => {
            const alias = requireValue(
              aliasNames.get(role.role),
              "semantic alias",
            );
            const safeRole = alias.slice("--color-".length);
            return [`--${prefix}-semantic-${safeRole}`, colorToCss(role.value)];
          }),
      ),
    }));

  return { prefix, primitiveVariables, aliases, schemes };
}

function renderTailwindTheme(
  model: TailwindTargetModel,
  darkSelector: string,
): string {
  const sections = [
    "/* Generated by @s9rg/theme-adapter-tailwind for Tailwind CSS v4. */",
  ];
  const runtime = buildRuntimeModel(model, darkSelector);

  if (Object.keys(model.primitiveVariables).length > 0) {
    sections.push(renderBlock("@theme", model.primitiveVariables));
  }

  if (
    runtime.defaultScheme !== undefined &&
    Object.keys(runtime.rootVariables).length > 0
  ) {
    sections.push(renderBlock(":root", runtime.rootVariables));
  }

  for (const override of runtime.overrides) {
    sections.push(renderBlock(override.selector, override.variables));
  }

  if (Object.keys(model.aliases).length > 0) {
    sections.push(renderBlock("@theme inline", model.aliases));
  }

  return `${sections.join("\n\n")}\n`;
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

function buildPreview(
  model: TailwindTargetModel,
  darkSelector: string,
): JsonValue {
  const runtime = buildRuntimeModel(model, darkSelector);
  return {
    kind: "tailwind-theme",
    version: "4",
    prefix: model.prefix,
    primitives: model.primitiveVariables,
    aliases: model.aliases,
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

function buildRuntimeModel(
  model: TailwindTargetModel,
  darkSelector: string,
): TailwindRuntimeModel {
  const defaultScheme =
    model.schemes.find((scheme) => scheme.id === "light") ?? model.schemes[0];
  const rootVariables = defaultScheme?.variables ?? {};
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
  model: TailwindTargetModel,
  requested: string,
  diagnostics: ThemeDiagnostic[],
): string {
  if (!isSafeThemeSelector(requested)) {
    diagnostics.push({
      severity: "warning",
      code: "tailwind.dark-selector.rejected",
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
    code: "tailwind.dark-selector.conflict",
    message: `The dark selector matched another generated scheme selector; ${JSON.stringify(DEFAULT_DARK_SELECTOR)} was used instead.`,
  });
  return DEFAULT_DARK_SELECTOR;
}

function addSchemeDiagnostics(
  model: TailwindTargetModel,
  diagnostics: ThemeDiagnostic[],
): void {
  if (model.schemes.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "tailwind.no-schemes",
      message:
        "No semantic schemes were supplied; only palette utilities were generated.",
      path: ["schemes"],
    });
    return;
  }

  if (!model.schemes.some((scheme) => scheme.id === "light")) {
    diagnostics.push({
      severity: "info",
      code: "tailwind.missing-light-scheme",
      message:
        "No light scheme was supplied; the first scheme was used for :root.",
      path: ["schemes"],
    });
  }
  if (!model.schemes.some((scheme) => scheme.id === "dark")) {
    diagnostics.push({
      severity: "info",
      code: "tailwind.missing-dark-scheme",
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
        code: "tailwind.scheme-role.gap",
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
  const suffix = color.alpha === 1 ? "" : ` / ${formatNumber(color.alpha)}`;

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
