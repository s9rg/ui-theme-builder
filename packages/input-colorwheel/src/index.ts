import { createThemeProject } from "@s9rg/theme-compiler";
import type {
  StructuredColor,
  ThemeProject,
  ThemeScheme,
} from "@s9rg/theme-compiler";
import { convertColor, formatColor, mapToGamut } from "@s9rg/colorwheel/core";
import type {
  JsonObject,
  Palette,
  PaletteDocument,
} from "@s9rg/colorwheel/core";

export interface ColorwheelThemeScheme {
  readonly id: string;
  readonly label?: string;
  /** Maps a semantic role name to a Colorwheel palette color ID. */
  readonly roles: Readonly<Record<string, string>>;
}

export interface ColorwheelThemeInputOptions {
  readonly id?: string;
  readonly name?: string;
  readonly schemes?: readonly ColorwheelThemeScheme[];
}

function unwrapPalette<Metadata extends object>(
  input: Palette<Metadata> | PaletteDocument<Metadata>,
): Palette<Metadata> {
  return "schema" in input ? input.palette : input;
}

function basePrimitiveId(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || `color-${stableHash(value)}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function allocatePrimitiveIds<Metadata extends object>(
  colors: Palette<Metadata>["colors"],
): ReadonlyMap<string, string> {
  const bases = new Map<string, string[]>();
  colors.forEach((entry) => {
    const base = basePrimitiveId(entry.id);
    const group = bases.get(base) ?? [];
    if (group.includes(entry.id))
      throw new TypeError(`Duplicate Colorwheel color ID "${entry.id}"`);
    bases.set(base, [...group, entry.id]);
  });

  const preferredNames: { readonly id: string; readonly preferred: string }[] =
    [];
  for (const [base, group] of bases) {
    const ordered = [...group].sort(compareText);
    for (const id of ordered) {
      preferredNames.push({
        id,
        preferred: ordered.length === 1 ? base : `${base}-${stableHash(id)}`,
      });
    }
  }

  preferredNames.sort(
    (left, right) =>
      compareText(left.preferred, right.preferred) ||
      compareText(left.id, right.id),
  );
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const { id, preferred } of preferredNames) {
    result.set(id, claimName(preferred, used));
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toStructuredColor(
  color: Palette["colors"][number]["color"],
): StructuredColor {
  // Colorwheel may preserve a wide-gamut source. The first compiler release emits portable sRGB,
  // so map deliberately rather than letting individual target adapters clip it differently.
  const converted = convertColor(color, "srgb");
  const mapped = mapToGamut(converted, "srgb").color;
  const hex = formatColor(mapped, { format: "hex", alpha: "never" });
  return {
    colorSpace: "srgb",
    components: [mapped.r, mapped.g, mapped.b],
    ...(mapped.alpha === undefined ? {} : { alpha: mapped.alpha }),
    hex,
  };
}

function toThemeSchemes(
  schemes: readonly ColorwheelThemeScheme[],
  primitiveIdByColorId: ReadonlyMap<string, string>,
): readonly ThemeScheme[] {
  return schemes.map((scheme) => {
    const roles = Object.fromEntries(
      Object.entries(scheme.roles).map(([role, colorId]) => {
        const primitiveId = primitiveIdByColorId.get(colorId);
        if (primitiveId === undefined) {
          throw new TypeError(
            `Scheme "${scheme.id}" role "${role}" references unknown Colorwheel color "${colorId}"`,
          );
        }
        return [role, { ref: primitiveId }];
      }),
    );
    return {
      id: scheme.id,
      ...(scheme.label === undefined ? {} : { label: scheme.label }),
      roles,
    };
  });
}

/**
 * Converts a public Colorwheel Palette or PaletteDocument into a compiler ThemeProject.
 *
 * Palette colors become named primitives. Semantic meaning is never guessed: callers must pass
 * explicit scheme role mappings when they want framework-ready themes.
 */
export function colorwheelPaletteToThemeProject<
  Metadata extends object = JsonObject,
>(
  input: Palette<Metadata> | PaletteDocument<Metadata>,
  options: ColorwheelThemeInputOptions = {},
): ThemeProject {
  const palette = unwrapPalette(input);
  if (palette.colors.length === 0) {
    throw new TypeError("A Colorwheel palette must contain at least one color");
  }

  const allocatedIds = allocatePrimitiveIds(palette.colors);
  const primitiveIdByColorId = new Map<string, string>();
  const primitives: Record<string, StructuredColor> = {};
  const labels = new Map<string, string>();

  palette.colors.forEach((entry) => {
    const primitiveId = allocatedIds.get(entry.id);
    if (primitiveId === undefined)
      throw new Error(`Missing primitive allocation for "${entry.id}"`);
    // createThemeProject namespaces named inputs under `palette.`.
    primitiveIdByColorId.set(entry.id, `palette.${primitiveId}`);
    primitives[primitiveId] = toStructuredColor(entry.color);
    labels.set(`palette.${primitiveId}`, entry.name?.trim() || entry.id);
  });

  const schemes = toThemeSchemes(options.schemes ?? [], primitiveIdByColorId);
  const project = createThemeProject(primitives, {
    ...(options.id === undefined ? {} : { id: options.id }),
    ...((options.name ?? palette.name) === undefined
      ? {}
      : { name: options.name ?? palette.name }),
    schemes,
  });
  return {
    ...project,
    primitives: project.primitives.map((primitive) => {
      const label = labels.get(primitive.id);
      return { ...primitive, ...(label === undefined ? {} : { label }) };
    }),
  };
}
