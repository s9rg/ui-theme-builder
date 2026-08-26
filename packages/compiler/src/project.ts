import { normalizeColor, parseHexColor } from "./color";
import {
  THEME_PROJECT_SCHEMA_VERSION,
  type ColorPrimitive,
  type CreateThemeProjectOptions,
  type ResolvedPrimitive,
  type ResolvedRole,
  type ResolvedScheme,
  type StructuredColor,
  type ThemeColorInput,
  type ThemeGraph,
  type ThemePaletteInput,
  type ThemeProject,
  type ThemeScheme,
} from "./types";

const UNSAFE_IDENTIFIER_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "color";
}

function cloneStructuredColor(value: StructuredColor): StructuredColor {
  const color: StructuredColor = {
    colorSpace: value.colorSpace,
    components: [value.components[0], value.components[1], value.components[2]],
  };
  const withAlpha =
    value.alpha === undefined ? color : { ...color, alpha: value.alpha };
  return value.hex === undefined ? withAlpha : { ...withAlpha, hex: value.hex };
}

function toColor(value: ThemeColorInput): StructuredColor {
  if (typeof value === "string") return parseHexColor(value);
  if (value === null || typeof value !== "object") {
    throw new TypeError(
      "A palette entry must be a strict hex string or a structured color.",
    );
  }
  return cloneStructuredColor(value);
}

function cloneScheme(scheme: ThemeScheme): ThemeScheme {
  const roles: Record<string, { ref: string }> = Object.create(null) as Record<
    string,
    { ref: string }
  >;
  for (const [role, reference] of Object.entries(scheme.roles)) {
    roles[role] = { ref: reference.ref };
  }
  const copy: ThemeScheme = { id: scheme.id, roles };
  return scheme.label === undefined ? copy : { ...copy, label: scheme.label };
}

/**
 * Creates a project without inventing semantic meaning. Callers must provide
 * schemes explicitly when a target needs semantic roles.
 */
export function createThemeProject(
  input: ThemePaletteInput,
  options: CreateThemeProjectOptions = {},
): ThemeProject {
  const primitives: ColorPrimitive[] = [];
  const ids = new Set<string>();

  if (Array.isArray(input)) {
    const palette = input as readonly ThemeColorInput[];
    for (let index = 0; index < palette.length; index += 1) {
      const entry = palette[index];
      if (entry === undefined)
        throw new TypeError(`Missing palette entry at index ${index}.`);
      primitives.push({
        id: `palette.color-${index + 1}`,
        $type: "color",
        value: toColor(entry),
        label: `Color ${index + 1}`,
      });
    }
  } else if (input !== null && typeof input === "object") {
    for (const [name, entry] of Object.entries(input)) {
      const segment = slugify(name);
      if (UNSAFE_IDENTIFIER_SEGMENTS.has(segment)) {
        throw new TypeError(
          `Palette name ${JSON.stringify(name)} produces an unsafe id.`,
        );
      }
      const id = `palette.${segment}`;
      if (ids.has(id)) {
        throw new TypeError(
          `Palette names collide after normalization at ${JSON.stringify(id)}.`,
        );
      }
      ids.add(id);
      primitives.push({
        id,
        $type: "color",
        value: toColor(entry),
        label: name,
      });
    }
  } else {
    throw new TypeError("A palette must be an array or a named record.");
  }

  const project: ThemeProject = {
    schemaVersion: THEME_PROJECT_SCHEMA_VERSION,
    id: options.id ?? "theme",
    primitives,
    schemes: (options.schemes ?? []).map(cloneScheme),
  };
  return options.name === undefined
    ? project
    : { ...project, name: options.name };
}

export function resolveThemeProject(project: ThemeProject): ThemeGraph {
  const primitiveById = new Map<string, ResolvedPrimitive>();
  const primitives = project.primitives.map((primitive): ResolvedPrimitive => {
    const resolved: ResolvedPrimitive = {
      id: primitive.id,
      $type: "color",
      value: normalizeColor(primitive.value),
    };
    const withLabel =
      primitive.label === undefined
        ? resolved
        : { ...resolved, label: primitive.label };
    primitiveById.set(primitive.id, withLabel);
    return withLabel;
  });

  const schemes = project.schemes.map((scheme): ResolvedScheme => {
    const roles: Record<string, ResolvedRole> = Object.create(null) as Record<
      string,
      ResolvedRole
    >;
    for (const [role, reference] of Object.entries(scheme.roles)) {
      const primitive = primitiveById.get(reference.ref);
      // Runtime validation guarantees the reference exists before resolution.
      if (primitive === undefined)
        throw new TypeError(`Unknown primitive reference ${reference.ref}.`);
      roles[role] = { role, ref: reference.ref, value: primitive.value };
    }
    const resolved: ResolvedScheme = { id: scheme.id, roles };
    return scheme.label === undefined
      ? resolved
      : { ...resolved, label: scheme.label };
  });

  const graph: ThemeGraph = {
    schemaVersion: THEME_PROJECT_SCHEMA_VERSION,
    projectId: project.id,
    primitives,
    schemes,
  };
  return project.name === undefined
    ? graph
    : { ...graph, projectName: project.name };
}
