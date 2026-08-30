import {
  DislikeAnalyzer,
  DynamicScheme,
  Hct,
  TemperatureCache,
  TonalPalette,
  Variant,
  argbFromHex,
  hexFromArgb,
} from "@material/material-color-utilities";
import type {
  JsonValue,
  ResolvedColor,
  ResolvedScheme,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
} from "@s9rg/theme-compiler";

export interface AngularMaterialAdapterOptions {
  /** Class or data-attribute selector used for the dark theme. */
  readonly darkSelector?: string;
}

export const ANGULAR_MATERIAL_SUPPORTED_ROLES = [
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "tertiary",
  "tertiary-foreground",
  "neutral",
  "neutral-variant",
  "error",
  "error-foreground",
  "background",
  "surface",
  "foreground",
  "muted-foreground",
  "divider",
] as const;

export const angularMaterialAdapterManifest = {
  id: "angular-material@22",
  name: "Angular Material v22",
  engineApiVersion: "1",
  adapterVersion: "0.6.0",
  maturity: "beta",
  target: { name: "@angular/material", version: ">=22 <23" },
  capabilities: {
    colors: { native: ["srgb"], fallback: "srgb-hex" },
    schemes: { count: "multiple", ids: ["light", "dark"] },
    roles: {
      requirement: "required",
      supported: ANGULAR_MATERIAL_SUPPORTED_ROLES,
      required: ["primary"],
    },
    preview: true,
  },
  options: {
    darkSelector: {
      type: "string",
      default: ".theme-dark",
      description: "Selector used to activate the dark Angular Material theme.",
      format: "css-selector",
    },
  },
} as const satisfies ThemeAdapterManifest;

type PaletteName =
  | "primary"
  | "secondary"
  | "tertiary"
  | "neutral"
  | "neutral-variant"
  | "error";

interface MaterialPalettes {
  readonly primary: TonalPalette;
  readonly secondary: TonalPalette;
  readonly tertiary: TonalPalette;
  readonly neutral: TonalPalette;
  readonly "neutral-variant": TonalPalette;
  readonly error: TonalPalette;
}

interface AngularMaterialSchemeModel {
  readonly id: "light" | "dark";
  readonly selector: string;
  readonly palettes: MaterialPalettes;
  readonly overrides: Readonly<Record<string, string>>;
}

const DEFAULT_DARK_SELECTOR = ".theme-dark";
const HUE_TONES = [
  0, 10, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100,
] as const;
const NEUTRAL_EXTRA_TONES = [4, 6, 12, 17, 22, 24, 87, 92, 94, 96] as const;
const KNOWN_ROLES = new Set<string>(ANGULAR_MATERIAL_SUPPORTED_ROLES);

export function createAngularMaterialAdapter(
  options: AngularMaterialAdapterOptions = {},
): ThemeAdapter {
  const requestedDarkSelector = options.darkSelector ?? DEFAULT_DARK_SELECTOR;
  const darkSelector = isSafeThemeSelector(requestedDarkSelector)
    ? requestedDarkSelector
    : DEFAULT_DARK_SELECTOR;

  return {
    manifest: angularMaterialAdapterManifest,
    configuration: Object.freeze({ darkSelector }),
    compile(graph, context) {
      context.signal?.throwIfAborted();
      const diagnostics: ThemeDiagnostic[] = [];
      if (darkSelector !== requestedDarkSelector) {
        diagnostics.push({
          severity: "warning",
          code: "angular-material.dark-selector.rejected",
          message: `The dark selector was unsafe; ${JSON.stringify(DEFAULT_DARK_SELECTOR)} was used instead.`,
        });
      }
      const schemes = buildTargetModel(graph, darkSelector, diagnostics);
      context.signal?.throwIfAborted();
      return {
        artifacts: [
          {
            path: "angular-material.theme.scss",
            mediaType: "text/x-scss",
            content: renderScss(schemes),
          },
        ],
        diagnostics,
        preview: {
          kind: "angular-material-m3",
          targetVersion: "22",
          schemes: Object.fromEntries(
            schemes.map((scheme) => [
              scheme.id,
              { selector: scheme.selector, overrides: scheme.overrides },
            ]),
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
): readonly AngularMaterialSchemeModel[] {
  const output: AngularMaterialSchemeModel[] = [];
  for (const scheme of [...graph.schemes].sort((left, right) =>
    compareSchemeIds(left.id, right.id),
  )) {
    if (scheme.id !== "light" && scheme.id !== "dark") {
      diagnostics.push({
        severity: "error",
        code: "angular-material.unsupported-scheme",
        message: `Angular Material generation supports light and dark schemes; ${JSON.stringify(scheme.id)} was not emitted.`,
        path: ["schemes", scheme.id],
      });
      continue;
    }
    const converted = new Map<string, string | null>();
    const read = (roleName: string): string | undefined => {
      if (converted.has(roleName)) return converted.get(roleName) ?? undefined;
      const role = scheme.roles[roleName];
      if (role === undefined) return undefined;
      const result = colorToOpaqueHex(role.value);
      if (result.value === undefined) {
        diagnostics.push({
          severity: "error",
          code: result.alphaUnsupported
            ? "angular-material.alpha.unsupported"
            : "angular-material.unsupported-color-space",
          message: result.alphaUnsupported
            ? `Role ${JSON.stringify(roleName)} is translucent; Material tonal seeds and system overrides require opaque colors.`
            : `Role ${JSON.stringify(roleName)} cannot be emitted without an sRGB fallback.`,
          path: ["schemes", scheme.id, "roles", roleName],
        });
        converted.set(roleName, null);
        return undefined;
      }
      if (result.usedFallback) {
        diagnostics.push({
          severity: "info",
          code: "angular-material.color-fallback.used",
          message: `Role ${JSON.stringify(roleName)} uses its sRGB hex fallback for Angular Material.`,
          path: ["schemes", scheme.id, "roles", roleName],
        });
      }
      converted.set(roleName, result.value);
      return result.value;
    };

    for (const role of Object.values(scheme.roles).sort((left, right) =>
      compareText(left.role, right.role),
    )) {
      if (!KNOWN_ROLES.has(role.role)) {
        diagnostics.push({
          severity: "warning",
          code: "angular-material.unsupported-role",
          message: `Semantic role ${JSON.stringify(role.role)} has no safe Angular Material system-token mapping and was skipped.`,
          path: ["schemes", scheme.id, "roles", role.role],
        });
      }
    }

    const primary = read("primary");
    if (primary === undefined) continue;
    const optionalSeeds = {
      secondary: read("secondary"),
      tertiary: read("tertiary"),
      neutral: read("neutral"),
      neutralVariant: read("neutral-variant"),
      error: read("error"),
    };
    const palettes = getColorPalettes(primary, optionalSeeds);
    const derived = Object.entries(optionalSeeds)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
    if (derived.length > 0) {
      diagnostics.push({
        severity: "info",
        code: "angular-material.palettes.derived",
        message: `Material Color Utilities generated ${derived.join(", ")} tonal palette${derived.length === 1 ? "" : "s"} from the explicit seed colors.`,
        path: ["schemes", scheme.id, "roles"],
      });
    }
    diagnostics.push({
      severity: "info",
      code: "angular-material.system-tokens.generated",
      message:
        "Angular Material supplies unspecified Material 3 system roles from the generated tonal palettes; explicit supported semantic roles are applied as overrides.",
      path: ["schemes", scheme.id, "roles"],
    });
    output.push({
      id: scheme.id,
      selector: scheme.id === "light" ? ":root" : darkSelector,
      palettes,
      overrides: buildOverrides(scheme, read),
    });
  }
  if (!output.some(({ id }) => id === "light")) {
    diagnostics.push({
      severity: "info",
      code: "angular-material.missing-light-scheme",
      message: "No root light theme was generated.",
      path: ["schemes"],
    });
  }
  if (!output.some(({ id }) => id === "dark")) {
    diagnostics.push({
      severity: "info",
      code: "angular-material.missing-dark-scheme",
      message: "No dark selector theme was generated.",
      path: ["schemes"],
    });
  }
  return output;
}

function getColorPalettes(
  primaryColor: string,
  optional: {
    readonly secondary: string | undefined;
    readonly tertiary: string | undefined;
    readonly neutral: string | undefined;
    readonly neutralVariant: string | undefined;
    readonly error: string | undefined;
  },
): MaterialPalettes {
  const primaryHct = Hct.fromInt(argbFromHex(primaryColor));
  const primary = TonalPalette.fromHct(primaryHct);
  const secondary = optional.secondary
    ? TonalPalette.fromHct(Hct.fromInt(argbFromHex(optional.secondary)))
    : TonalPalette.fromHueAndChroma(
        primaryHct.hue,
        Math.max(primaryHct.chroma - 32, primaryHct.chroma * 0.5),
      );
  const tertiary = optional.tertiary
    ? TonalPalette.fromHct(Hct.fromInt(argbFromHex(optional.tertiary)))
    : TonalPalette.fromInt(
        DislikeAnalyzer.fixIfDisliked(
          requireValue(
            new TemperatureCache(primaryHct).analogous(3, 6)[2],
            "Material analogous tertiary",
          ),
        ).toInt(),
      );
  const neutral = optional.neutral
    ? TonalPalette.fromHct(Hct.fromInt(argbFromHex(optional.neutral)))
    : TonalPalette.fromHueAndChroma(primaryHct.hue, primaryHct.chroma / 8);
  const neutralVariant = optional.neutralVariant
    ? TonalPalette.fromHct(Hct.fromInt(argbFromHex(optional.neutralVariant)))
    : TonalPalette.fromHueAndChroma(primaryHct.hue, primaryHct.chroma / 8 + 4);
  const error = optional.error
    ? TonalPalette.fromHct(Hct.fromInt(argbFromHex(optional.error)))
    : new DynamicScheme({
        sourceColorHct: primary.keyColor,
        variant: Variant.FIDELITY,
        contrastLevel: 0,
        isDark: false,
        primaryPalette: primary,
        secondaryPalette: secondary,
        tertiaryPalette: tertiary,
        neutralPalette: neutral,
        neutralVariantPalette: neutralVariant,
      }).errorPalette;
  return {
    primary,
    secondary,
    tertiary,
    neutral,
    "neutral-variant": neutralVariant,
    error,
  };
}

function buildOverrides(
  scheme: ResolvedScheme,
  read: (roleName: string) => string | undefined,
): Readonly<Record<string, string>> {
  const overrides: Record<string, string> = {};
  const mappings: readonly (readonly [string, readonly string[]])[] = [
    ["primary", ["primary"]],
    ["primary-foreground", ["on-primary"]],
    ["secondary", ["secondary"]],
    ["secondary-foreground", ["on-secondary"]],
    ["tertiary", ["tertiary"]],
    ["tertiary-foreground", ["on-tertiary"]],
    ["error", ["error"]],
    ["error-foreground", ["on-error"]],
    ["background", ["background"]],
    ["surface", ["surface"]],
    ["foreground", ["on-background", "on-surface"]],
    ["muted-foreground", ["on-surface-variant"]],
    ["divider", ["outline-variant"]],
  ];
  for (const [source, targets] of mappings) {
    if (scheme.roles[source] === undefined) continue;
    const value = read(source);
    if (value === undefined) continue;
    for (const target of targets) overrides[target] = value;
  }
  return overrides;
}

function renderScss(schemes: readonly AngularMaterialSchemeModel[]): string {
  const lines = [
    "// Generated for Angular Material v22 with Material Color Utilities 0.4.0.",
    "@use 'sass:map';",
    "@use '@angular/material' as mat;",
    "",
  ];
  for (const scheme of schemes) {
    const prefix = `_${scheme.id}`;
    lines.push(`$${prefix}-palettes: (`);
    for (const name of [
      "primary",
      "secondary",
      "tertiary",
      "neutral",
      "neutral-variant",
      "error",
    ] as const satisfies readonly PaletteName[]) {
      lines.push(`  ${name}: (`);
      const tones =
        name === "neutral"
          ? [...HUE_TONES, ...NEUTRAL_EXTRA_TONES].sort(
              (left, right) => left - right,
            )
          : HUE_TONES;
      for (const tone of tones) {
        lines.push(
          `    ${tone}: ${hexFromArgb(scheme.palettes[name].tone(tone))},`,
        );
      }
      lines.push("  ),");
    }
    lines.push(
      ");",
      `$${prefix}-rest: (`,
      `  secondary: map.get($${prefix}-palettes, secondary),`,
      `  neutral: map.get($${prefix}-palettes, neutral),`,
      `  neutral-variant: map.get($${prefix}-palettes, neutral-variant),`,
      `  error: map.get($${prefix}-palettes, error),`,
      ");",
      `$${prefix}-primary: map.merge(map.get($${prefix}-palettes, primary), $${prefix}-rest);`,
      `$${prefix}-tertiary: map.merge(map.get($${prefix}-palettes, tertiary), $${prefix}-rest);`,
      "",
      `${scheme.selector} {`,
      `  color-scheme: ${scheme.id};`,
      "  @include mat.theme((",
      "    color: (",
      `      theme-type: ${scheme.id},`,
      `      primary: $${prefix}-primary,`,
      `      tertiary: $${prefix}-tertiary,`,
      "    ),",
      "  ));",
    );
    if (Object.keys(scheme.overrides).length > 0) {
      lines.push("  @include mat.theme-overrides((");
      for (const [name, value] of Object.entries(scheme.overrides)) {
        lines.push(`    ${name}: ${value},`);
      }
      lines.push("  ));");
    }
    lines.push("}", "");
  }
  return `${lines.join("\n")}\n`;
}

function colorToOpaqueHex(color: ResolvedColor): {
  readonly value?: string;
  readonly usedFallback: boolean;
  readonly alphaUnsupported: boolean;
} {
  if (color.alpha !== 1) {
    return { usedFallback: false, alphaUnsupported: true };
  }
  if (isHexFallback(color.hex)) {
    return {
      value: color.hex.toLowerCase(),
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
      value: `#${[red, green, blue]
        .map((component) =>
          Math.round(clamp(component, 0, 1) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`,
      usedFallback: false,
      alphaUnsupported: false,
    };
  }
  return { usedFallback: false, alphaUnsupported: false };
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
