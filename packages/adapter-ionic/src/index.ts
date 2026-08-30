import type {
  JsonValue,
  ResolvedColor,
  ResolvedScheme,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
} from "@s9rg/theme-compiler";

export interface IonicAdapterOptions {
  /** Class or data-attribute selector used for the dark palette. */
  readonly darkSelector?: string;
}

export const IONIC_SUPPORTED_ROLES = [
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "tertiary",
  "tertiary-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "danger",
  "danger-foreground",
  "error",
  "error-foreground",
  "background",
  "surface",
  "foreground",
  "muted-foreground",
  "divider",
] as const;

export const ionicAdapterManifest = {
  id: "ionic@9",
  name: "Ionic v9",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: { name: "@ionic/core", version: ">=9 <10" },
  capabilities: {
    colors: { native: ["srgb"], fallback: "srgb-hex" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "required",
      supported: IONIC_SUPPORTED_ROLES,
      required: ["primary"],
    },
    preview: true,
  },
  options: {
    darkSelector: {
      type: "string",
      default: ".ion-palette-dark",
      description: "Selector used to activate the dark Ionic palette.",
      format: "css-selector",
    },
  },
} as const satisfies ThemeAdapterManifest;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface IonicSchemeModel {
  readonly id: "light" | "dark";
  readonly selector: string;
  readonly variables: Readonly<Record<string, string>>;
}

interface LayerMapping {
  readonly target: string;
  readonly baseRoles: readonly string[];
  readonly contrastRoles: readonly string[];
}

const DEFAULT_DARK_SELECTOR = ".ion-palette-dark";
const KNOWN_ROLES = new Set<string>(IONIC_SUPPORTED_ROLES);
const LAYERS: readonly LayerMapping[] = [
  {
    target: "primary",
    baseRoles: ["primary"],
    contrastRoles: ["primary-foreground"],
  },
  {
    target: "secondary",
    baseRoles: ["secondary"],
    contrastRoles: ["secondary-foreground"],
  },
  {
    target: "tertiary",
    baseRoles: ["tertiary"],
    contrastRoles: ["tertiary-foreground"],
  },
  {
    target: "success",
    baseRoles: ["success"],
    contrastRoles: ["success-foreground"],
  },
  {
    target: "warning",
    baseRoles: ["warning"],
    contrastRoles: ["warning-foreground"],
  },
  {
    target: "danger",
    baseRoles: ["danger", "error"],
    contrastRoles: ["danger-foreground", "error-foreground"],
  },
];

export function createIonicAdapter(
  options: IonicAdapterOptions = {},
): ThemeAdapter {
  const requestedDarkSelector = options.darkSelector ?? DEFAULT_DARK_SELECTOR;
  const darkSelector = isSafeThemeSelector(requestedDarkSelector)
    ? requestedDarkSelector
    : DEFAULT_DARK_SELECTOR;

  return {
    manifest: ionicAdapterManifest,
    configuration: Object.freeze({ darkSelector }),
    compile(graph, context) {
      context.signal?.throwIfAborted();
      const diagnostics: ThemeDiagnostic[] = [];
      if (darkSelector !== requestedDarkSelector) {
        diagnostics.push({
          severity: "warning",
          code: "ionic.dark-selector.rejected",
          message: `The dark selector was unsafe; ${JSON.stringify(DEFAULT_DARK_SELECTOR)} was used instead.`,
        });
      }
      const schemes = buildTargetModel(graph, darkSelector, diagnostics);
      context.signal?.throwIfAborted();
      return {
        artifacts: [
          {
            path: "ionic.theme.css",
            mediaType: "text/css",
            content: renderCss(schemes),
          },
        ],
        diagnostics,
        preview: {
          kind: "ionic-css-variables",
          targetVersion: "9",
          schemes: Object.fromEntries(
            schemes.map((scheme) => [scheme.id, scheme.variables]),
          ),
        } as JsonValue,
      };
    },
  };
}

function buildTargetModel(
  graph: ThemeGraph,
  darkSelector: string,
  diagnostics: ThemeDiagnostic[],
): readonly IonicSchemeModel[] {
  const output: IonicSchemeModel[] = [];
  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareSchemeIds(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "ionic.unsupported-scheme",
        message: `Ionic generation supports light and dark schemes; ${JSON.stringify(scheme.id)} was not emitted.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    output.push({
      id: scheme.id,
      selector: scheme.id === "light" ? ":root" : darkSelector,
      variables: buildVariables(scheme, diagnostics),
    });
  }
  if (!output.some(({ id }) => id === "light")) {
    diagnostics.push({
      severity: "info",
      code: "ionic.missing-light-scheme",
      message: "No :root light palette was generated.",
      path: ["schemes"],
    });
  }
  if (!output.some(({ id }) => id === "dark")) {
    diagnostics.push({
      severity: "info",
      code: "ionic.missing-dark-scheme",
      message: "No dark palette selector was generated.",
      path: ["schemes"],
    });
  }
  return output;
}

function buildVariables(
  scheme: ResolvedScheme,
  diagnostics: ThemeDiagnostic[],
): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};
  const converted = new Map<string, Rgb | null>();
  const read = (roleName: string): Rgb | undefined => {
    if (converted.has(roleName)) return converted.get(roleName) ?? undefined;
    const role = scheme.roles[roleName];
    if (role === undefined) return undefined;
    const result = colorToRgb(role.value);
    if (result.rgb === undefined) {
      diagnostics.push({
        severity: "error",
        code: result.alphaUnsupported
          ? "ionic.alpha.unsupported"
          : "ionic.unsupported-color-space",
        message: result.alphaUnsupported
          ? `Role ${JSON.stringify(roleName)} is translucent; Ionic layered RGB variables require an opaque color.`
          : `Role ${JSON.stringify(roleName)} cannot be emitted without an sRGB fallback.`,
        path: ["schemes", scheme.id, "roles", roleName],
      });
      converted.set(roleName, null);
      return undefined;
    }
    if (result.usedFallback) {
      diagnostics.push({
        severity: "info",
        code: "ionic.color-fallback.used",
        message: `Role ${JSON.stringify(roleName)} uses its sRGB hex fallback for Ionic.`,
        path: ["schemes", scheme.id, "roles", roleName],
      });
    }
    converted.set(roleName, result.rgb);
    return result.rgb;
  };

  for (const role of Object.values(scheme.roles).sort((left, right) =>
    compareText(left.role, right.role),
  )) {
    if (!KNOWN_ROLES.has(role.role)) {
      diagnostics.push({
        severity: "warning",
        code: "ionic.unsupported-role",
        message: `Semantic role ${JSON.stringify(role.role)} has no safe Ionic mapping and was skipped.`,
        path: ["schemes", scheme.id, "roles", role.role],
      });
    }
  }

  for (const layer of LAYERS) {
    const baseCandidates = layer.baseRoles.filter(
      (role) => scheme.roles[role] !== undefined,
    );
    if (baseCandidates.length === 0) continue;
    if (baseCandidates.length > 1) {
      diagnostics.push({
        severity: "warning",
        code: "ionic.role.collision",
        message: `${baseCandidates.map((role) => JSON.stringify(role)).join(" and ")} both map to Ionic ${layer.target}; ${JSON.stringify(baseCandidates[0])} was used.`,
        path: ["schemes", scheme.id, "roles"],
      });
    }
    const baseRole = requireValue(baseCandidates[0], "Ionic base role");
    const base = read(baseRole);
    if (base === undefined) continue;
    const contrastCandidates = layer.contrastRoles.filter(
      (role) => scheme.roles[role] !== undefined,
    );
    if (contrastCandidates.length > 1) {
      diagnostics.push({
        severity: "warning",
        code: "ionic.contrast-role.collision",
        message: `${contrastCandidates.map((role) => JSON.stringify(role)).join(" and ")} both map to Ionic ${layer.target} contrast; ${JSON.stringify(contrastCandidates[0])} was used.`,
        path: ["schemes", scheme.id, "roles"],
      });
    }
    const explicitContrast =
      contrastCandidates.length === 0
        ? undefined
        : read(requireValue(contrastCandidates[0], "Ionic contrast role"));
    const contrast = explicitContrast ?? bestContrast(base);
    if (explicitContrast === undefined) {
      diagnostics.push({
        severity: "info",
        code: "ionic.contrast.derived",
        message: `Ionic ${layer.target} contrast was selected from black and white because no usable explicit foreground role was supplied.`,
        path: ["schemes", scheme.id, "roles", baseRole],
      });
    }
    const prefix = `--ion-color-${layer.target}`;
    variables[prefix] = rgbToHex(base);
    variables[`${prefix}-rgb`] = rgbToList(base);
    variables[`${prefix}-contrast`] = rgbToHex(contrast);
    variables[`${prefix}-contrast-rgb`] = rgbToList(contrast);
    variables[`${prefix}-shade`] = rgbToHex(
      mix(base, { r: 0, g: 0, b: 0 }, 0.12),
    );
    variables[`${prefix}-tint`] = rgbToHex(
      mix(base, { r: 255, g: 255, b: 255 }, 0.1),
    );
  }

  const background = read("background");
  const foreground = read("foreground");
  const surface = read("surface");
  const muted = read("muted-foreground");
  const divider = read("divider");
  if (background !== undefined) {
    variables["--ion-background-color"] = rgbToHex(background);
    variables["--ion-background-color-rgb"] = rgbToList(background);
  }
  if (foreground !== undefined) {
    variables["--ion-text-color"] = rgbToHex(foreground);
    variables["--ion-text-color-rgb"] = rgbToList(foreground);
    variables["--ion-item-color"] = rgbToHex(foreground);
    variables["--ion-toolbar-color"] = rgbToHex(foreground);
    variables["--ion-tab-bar-color"] = rgbToHex(foreground);
  }
  if (surface !== undefined) {
    for (const name of [
      "--ion-overlay-background-color",
      "--ion-card-background",
      "--ion-item-background",
      "--ion-toolbar-background",
      "--ion-tab-bar-background",
    ]) {
      variables[name] = rgbToHex(surface);
    }
  }
  if (muted !== undefined)
    variables["--ion-placeholder-color"] = rgbToHex(muted);
  if (divider !== undefined) {
    for (const name of [
      "--ion-border-color",
      "--ion-item-border-color",
      "--ion-toolbar-border-color",
      "--ion-tab-bar-border-color",
    ]) {
      variables[name] = rgbToHex(divider);
    }
  }
  if (background !== undefined && foreground !== undefined) {
    for (let step = 50; step <= 950; step += 50) {
      const amount = step / 1_000;
      variables[`--ion-text-color-step-${step}`] = rgbToHex(
        mix(foreground, background, amount),
      );
      variables[`--ion-background-color-step-${step}`] = rgbToHex(
        mix(background, foreground, amount),
      );
    }
    diagnostics.push({
      severity: "info",
      code: "ionic.stepped-colors.derived",
      message:
        "Ionic text and background stepped colors were generated at the documented 5% increments.",
      path: ["schemes", scheme.id, "roles"],
    });
  }
  return variables;
}

function colorToRgb(color: ResolvedColor): {
  readonly rgb?: Rgb;
  readonly usedFallback: boolean;
  readonly alphaUnsupported: boolean;
} {
  if (color.alpha !== 1) {
    return { usedFallback: false, alphaUnsupported: true };
  }
  if (isHexFallback(color.hex)) {
    return {
      rgb: parseHex(color.hex),
      usedFallback: color.colorSpace !== "srgb",
      alphaUnsupported: false,
    };
  }
  const [red, green, blue] = color.components;
  if (
    color.colorSpace === "srgb" &&
    isNumber(red) &&
    isNumber(green) &&
    isNumber(blue)
  ) {
    return {
      rgb: {
        r: Math.round(clamp(red, 0, 1) * 255),
        g: Math.round(clamp(green, 0, 1) * 255),
        b: Math.round(clamp(blue, 0, 1) * 255),
      },
      usedFallback: false,
      alphaUnsupported: false,
    };
  }
  return { usedFallback: false, alphaUnsupported: false };
}

function renderCss(schemes: readonly IonicSchemeModel[]): string {
  const lines = [
    "/* Generated for Ionic v9. Import after Ionic's core styles. */",
  ];
  for (const scheme of schemes) {
    lines.push("", `${scheme.selector} {`);
    for (const [name, value] of Object.entries(scheme.variables)) {
      lines.push(`  ${name}: ${value};`);
    }
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}

function parseHex(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToList({ r, g, b }: Rgb): string {
  return `${r},${g},${b}`;
}

function mix(base: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: Math.round(amount * target.r + (1 - amount) * base.r),
    g: Math.round(amount * target.g + (1 - amount) * base.g),
    b: Math.round(amount * target.b + (1 - amount) * base.b),
  };
}

function bestContrast(base: Rgb): Rgb {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  return contrastRatio(base, black) >= contrastRatio(base, white)
    ? black
    : white;
}

function contrastRatio(left: Rgb, right: Rgb): number {
  const first = relativeLuminance(left);
  const second = relativeLuminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const [red, green, blue] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * requireValue(red, "red luminance") +
    0.7152 * requireValue(green, "green luminance") +
    0.0722 * requireValue(blue, "blue luminance")
  );
}

function isSafeThemeSelector(value: string): boolean {
  return (
    /^\.[A-Za-z_][A-Za-z0-9_-]*$/.test(value) ||
    /^\[data-[a-z0-9_-]+="[a-z0-9_-]+"\]$/i.test(value)
  );
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSchemeIds(left: string, right: string): number {
  const rank = (id: string): number =>
    id === "light" ? 0 : id === "dark" ? 1 : 2;
  return rank(left) - rank(right) || compareText(left, right);
}

function requireValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(
      `Internal adapter invariant failed: missing ${description}.`,
    );
  }
  return value;
}
