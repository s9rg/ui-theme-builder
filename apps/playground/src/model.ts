import {
  contrastRatio,
  convertColor,
  createHarmonyPalette,
  formatColor,
} from "@s9rg/colorwheel/core";
import type { ColorValue, Palette, PaletteColor } from "@s9rg/colorwheel/core";
import type {
  PreviewFidelity,
  PreviewProfile,
} from "@s9rg/theme-demo-protocol";

export const SEMANTIC_ROLES = [
  "background",
  "surface",
  "foreground",
  "muted",
  "primary",
  "primaryText",
  "accent",
  "accentText",
  "border",
] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];
export type RoleMapping = Readonly<Record<SemanticRole, string>>;
export type SchemeMappings = Readonly<Record<PreviewProfile, RoleMapping>>;

export const THEORY_MODES = [
  "complementary",
  "analogous",
  "triadic",
  "split-complementary",
  "tetradic",
  "monochromatic",
] as const;

export type TheoryMode = (typeof THEORY_MODES)[number];

export const ROLE_LABELS: Readonly<Record<SemanticRole, string>> = {
  background: "Canvas",
  surface: "Surface",
  foreground: "Text",
  muted: "Muted text",
  primary: "Primary",
  primaryText: "On primary",
  accent: "Accent",
  accentText: "On accent",
  border: "Border",
};

export type TargetKey = "dtcg" | "css" | "tailwind" | "mui";

export interface TargetDefinition {
  readonly key: TargetKey;
  readonly adapterId: string;
  readonly name: string;
  readonly profile: string;
  readonly fidelity: PreviewFidelity;
  readonly description: string;
  readonly artifactHint: string;
}

export const TARGETS: readonly TargetDefinition[] = [
  {
    key: "css",
    adapterId: "css@1",
    name: "CSS variables",
    profile: "Modern CSS",
    fidelity: "exact-css-variables",
    description: "Framework-neutral custom properties with a dark scheme.",
    artifactHint: "CSS",
  },
  {
    key: "tailwind",
    adapterId: "tailwind@4",
    name: "Tailwind",
    profile: "Tailwind v4",
    fidelity: "mapped-preview",
    description: "CSS-first theme variables ready for Tailwind utilities.",
    artifactHint: "CSS",
  },
  {
    key: "mui",
    adapterId: "mui@9",
    name: "Material UI",
    profile: "MUI v9",
    fidelity: "exact-runtime",
    description:
      "Typed color-scheme options previewed through the real provider.",
    artifactHint: "TypeScript",
  },
  {
    key: "dtcg",
    adapterId: "dtcg@2025.10",
    name: "Design Tokens",
    profile: "DTCG 2025.10",
    fidelity: "mapped-preview",
    description:
      "Portable structured tokens and aliases for downstream tooling.",
    artifactHint: "JSON",
  },
] as const;

const RELATIONSHIP_LABELS: Readonly<Record<TheoryMode, string>> = {
  complementary: "Complementary",
  analogous: "Analogous",
  triadic: "Triadic",
  "split-complementary": "Split complementary",
  tetradic: "Tetradic",
  monochromatic: "Monochromatic",
};

export function theoryMode(palette: Palette): TheoryMode | undefined {
  const type = palette.recipe?.harmony?.type;
  return THEORY_MODES.find((candidate) => candidate === type);
}

/** Adds readable labels without changing recipe ownership or stable IDs. */
export function decorateTheoryPalette(palette: Palette): Palette {
  const mode = theoryMode(palette);
  const seedColorId = palette.recipe?.seedColorId;
  let companion = 0;
  return {
    ...palette,
    ...(mode === undefined
      ? {}
      : { name: `${RELATIONSHIP_LABELS[mode]} brand palette` }),
    colors: palette.colors.map((entry) => {
      const isSeed = entry.id === seedColorId;
      companion += isSeed ? 0 : 1;
      return {
        ...entry,
        name: isSeed
          ? "Seed"
          : mode === "complementary" && palette.colors.length === 2
            ? "Complement"
            : `Companion ${companion}`,
        role: isSeed ? "brand" : "brand-companion",
      };
    }),
  };
}

export const INITIAL_THEORY_PALETTE: Palette = decorateTheoryPalette(
  createHarmonyPalette({
    seed: "#be123c",
    harmony: { type: "complementary" },
    outputGamut: "srgb",
    name: "Complementary brand palette",
    idFactory: (index) => (index === 0 ? "brand" : "accent"),
  }),
);

export const SUPPORTING_COLORS: readonly PaletteColor[] = [
  {
    id: "paper",
    name: "Light canvas",
    role: "light-canvas",
    color: { space: "srgb", r: 0.973, g: 0.98, b: 0.996 },
  },
  {
    id: "white",
    name: "White",
    role: "light-surface",
    color: { space: "srgb", r: 1, g: 1, b: 1 },
  },
  {
    id: "ink",
    name: "Ink",
    role: "dark-surface",
    color: { space: "srgb", r: 0.075, g: 0.086, b: 0.122 },
  },
  {
    id: "slate",
    name: "Light muted text",
    role: "light-muted",
    color: { space: "srgb", r: 0.4, g: 0.439, b: 0.541 },
  },
  {
    id: "mist",
    name: "Light border",
    role: "light-border",
    color: { space: "srgb", r: 0.851, g: 0.871, b: 0.918 },
  },
  {
    id: "night",
    name: "Dark canvas",
    role: "dark-canvas",
    color: { space: "srgb", r: 0.027, g: 0.035, b: 0.059 },
  },
  {
    id: "silver",
    name: "Dark muted text",
    role: "dark-muted",
    color: { space: "srgb", r: 0.604, g: 0.639, b: 0.706 },
  },
  {
    id: "graphite",
    name: "Dark border",
    role: "dark-border",
    color: { space: "srgb", r: 0.165, g: 0.188, b: 0.239 },
  },
] as const;

/**
 * Combines generated brand colors with a curated, read-only UI foundation.
 * The Colorwheel editor receives only the theory palette; the compiler receives both.
 */
export function buildThemePalette(theoryPalette: Palette): Palette {
  const claimed = new Set(theoryPalette.colors.map((entry) => entry.id));
  for (const entry of SUPPORTING_COLORS) {
    if (claimed.has(entry.id)) {
      throw new TypeError(
        `Theory color ID ${JSON.stringify(entry.id)} is reserved by the UI foundation`,
      );
    }
  }
  return {
    ...theoryPalette,
    name: `${theoryPalette.name ?? "Color theory"} with Slate foundation`,
    colors: [...theoryPalette.colors, ...SUPPORTING_COLORS],
  };
}

export const INITIAL_PALETTE: Palette = buildThemePalette(
  INITIAL_THEORY_PALETTE,
);

export function relationshipSummary(palette: Palette): string {
  const harmony = palette.recipe?.harmony;
  switch (harmony?.type) {
    case "complementary":
      return "Complementary · 2 colors · 180° apart";
    case "analogous":
      return `Analogous · ${harmony.count ?? 3} colors · ${harmony.spread ?? 30}° steps`;
    case "triadic":
      return "Triadic · 3 colors · 120° apart";
    case "split-complementary":
      return `Split complementary · 3 colors · ${harmony.spread ?? 60}° split`;
    case "tetradic":
      return "Tetradic · 4 colors · 90° apart";
    case "monochromatic":
      return `Monochromatic · ${harmony.count ?? 5} tones · one hue`;
    default:
      return `${palette.colors.length} generated brand colors`;
  }
}

export const INITIAL_MAPPINGS: SchemeMappings = {
  light: {
    background: "paper",
    surface: "white",
    foreground: "ink",
    muted: "slate",
    primary: "brand",
    primaryText: "white",
    accent: "accent",
    accentText: "white",
    border: "mist",
  },
  dark: {
    background: "night",
    surface: "ink",
    foreground: "white",
    muted: "silver",
    primary: "brand",
    primaryText: "white",
    accent: "accent",
    accentText: "white",
    border: "graphite",
  },
};

export function reconcileMappings(
  palette: Palette,
  current: SchemeMappings,
): SchemeMappings {
  const available = new Set(palette.colors.map((entry) => entry.id));
  const reconcile = (
    mapping: RoleMapping,
    fallback: RoleMapping,
  ): RoleMapping =>
    Object.fromEntries(
      SEMANTIC_ROLES.map((role) => [
        role,
        available.has(mapping[role]) ? mapping[role] : fallback[role],
      ]),
    ) as unknown as RoleMapping;

  return {
    light: reconcile(current.light, INITIAL_MAPPINGS.light),
    dark: reconcile(current.dark, INITIAL_MAPPINGS.dark),
  };
}

export function paletteColor(palette: Palette, colorId: string): ColorValue {
  const entry = palette.colors.find((candidate) => candidate.id === colorId);
  if (entry === undefined)
    throw new TypeError(`Palette color "${colorId}" was not found`);
  return entry.color;
}

export function cssColor(palette: Palette, colorId: string): string {
  return formatColor(convertColor(paletteColor(palette, colorId), "srgb"), {
    format: "hex",
    alpha: "auto",
  });
}

export interface ContrastCheck {
  readonly label: string;
  readonly ratio: number;
  readonly pass: boolean;
}

export function getContrastChecks(
  palette: Palette,
  mapping: RoleMapping,
): readonly ContrastCheck[] {
  const pairs = [
    ["Body text", "foreground", "background"],
    ["Muted text", "muted", "background"],
    ["Primary label", "primaryText", "primary"],
    ["Accent label", "accentText", "accent"],
  ] as const satisfies readonly [string, SemanticRole, SemanticRole][];

  return pairs.map(([label, foreground, background]) => {
    const ratio = contrastRatio(
      paletteColor(palette, mapping[foreground]),
      paletteColor(palette, mapping[background]),
      paletteColor(palette, mapping.background),
    );
    return { label, ratio, pass: ratio >= 4.5 };
  });
}
