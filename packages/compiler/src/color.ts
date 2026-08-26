import type {
  ColorComponent,
  ColorSpace,
  ResolvedColor,
  StructuredColor,
} from "./types";

export const COLOR_SPACES = [
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d50",
  "xyz-d65",
] as const satisfies readonly ColorSpace[];

const COLOR_SPACE_SET = new Set<string>(COLOR_SPACES);
const STRICT_HEX =
  /^#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/;
const DTCG_HEX = /^#[\da-fA-F]{6}$/;

export function isColorSpace(value: unknown): value is ColorSpace {
  return typeof value === "string" && COLOR_SPACE_SET.has(value);
}

/**
 * Parses #RGB, #RGBA, #RRGGBB, or #RRGGBBAA. Other CSS color syntax is
 * deliberately rejected instead of being interpreted differently by hosts.
 */
export function parseHexColor(input: string): StructuredColor {
  if (!STRICT_HEX.test(input)) {
    throw new TypeError(
      `Unsupported color ${JSON.stringify(input)}. Expected #RGB, #RGBA, #RRGGBB, or #RRGGBBAA.`,
    );
  }

  const compact = input.slice(1);
  const expanded =
    compact.length === 3 || compact.length === 4
      ? [...compact].map((character) => character + character).join("")
      : compact;
  const hasAlpha = expanded.length === 8;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const alpha = hasAlpha ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
  // DTCG keeps alpha in a separate field; its optional hex fallback is always
  // exactly #RRGGBB, even when the source hex included alpha.
  const normalizedHex = `#${expanded.slice(0, 6).toLowerCase()}`;

  return {
    colorSpace: "srgb",
    components: [red / 255, green / 255, blue / 255],
    alpha,
    hex: normalizedHex,
  };
}

export function normalizeColor(color: StructuredColor): ResolvedColor {
  const components: [ColorComponent, ColorComponent, ColorComponent] = [
    color.components[0],
    color.components[1],
    color.components[2],
  ];
  const normalized: ResolvedColor = {
    colorSpace: color.colorSpace,
    components,
    alpha: color.alpha ?? 1,
  };

  return color.hex === undefined
    ? normalized
    : { ...normalized, hex: color.hex.toLowerCase() };
}

export function isStrictHex(value: unknown): value is string {
  return typeof value === "string" && STRICT_HEX.test(value);
}

export function isDtcgHex(value: unknown): value is string {
  return typeof value === "string" && DTCG_HEX.test(value);
}
