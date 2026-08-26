import { COLOR_SPACES, isColorSpace, isDtcgHex, parseHexColor } from "./color";
import type {
  CompilerLimits,
  JsonValue,
  JsonValueParseResult,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeProject,
  VirtualArtifact,
} from "./types";

export const DEFAULT_COMPILER_LIMITS: CompilerLimits = Object.freeze({
  maxPrimitives: 1_024,
  maxSchemes: 32,
  maxRolesPerScheme: 256,
  maxAdapters: 32,
  maxArtifacts: 256,
  maxArtifactBytes: 2 * 1024 * 1024,
  maxTotalArtifactBytes: 10 * 1024 * 1024,
  maxPathLength: 240,
});

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/;
const DIAGNOSTIC_CODE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MEDIA_TYPE =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*[a-z0-9!#$&^_.+-]+=[^;\r\n]+)*$/i;
const ADAPTER_ID = /^[a-z0-9][a-z0-9._/-]*@[a-z0-9][a-z0-9.+_-]*$/i;
const UNSAFE_IDENTIFIER_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function diagnostic(
  code: string,
  message: string,
  path?: readonly (string | number)[],
): ThemeDiagnostic {
  return path === undefined
    ? { severity: "error", code, message }
    : { severity: "error", code, message, path };
}

/**
 * Runtime boundary values must be inert data. Rejecting accessors ensures the
 * later validation and snapshot phases cannot observe different getter values.
 */
export function validateDataBoundary(
  value: unknown,
  rootPath: readonly (string | number)[] = [],
): ThemeDiagnostic[] {
  const maxDepth = 256;
  const maxEntries = 100_000;
  const seen = new WeakSet<object>();
  let visited = 0;
  let inspectedEntries = 0;
  const pending: {
    readonly candidate: unknown;
    readonly path: readonly (string | number)[];
    readonly depth: number;
  }[] = [{ candidate: value, path: rootPath, depth: 0 }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { candidate, path, depth } = current;
    if (
      candidate === null ||
      (typeof candidate !== "object" && typeof candidate !== "function")
    ) {
      continue;
    }
    if (typeof candidate === "function" || seen.has(candidate)) continue;
    seen.add(candidate);
    visited += 1;
    if (visited > 100_000) {
      return [
        diagnostic(
          "boundary.size.exceeded",
          "Runtime boundary contains too many nested objects.",
          path,
        ),
      ];
    }
    if (depth > maxDepth) {
      return [
        diagnostic(
          "boundary.depth.exceeded",
          `Runtime boundary exceeds the maximum depth of ${maxDepth}.`,
          path,
        ),
      ];
    }
    let arrayCandidate: boolean;
    let prototype: object | null;
    try {
      // Array.isArray can throw for a revoked proxy. Runtime boundary
      // inspection must be total even when an untrusted adapter returns one.
      arrayCandidate = Array.isArray(candidate);
      prototype = Reflect.getPrototypeOf(candidate);
    } catch {
      return [
        diagnostic(
          "boundary.inspect.failed",
          "Runtime boundary prototype could not be safely inspected.",
          path,
        ),
      ];
    }
    if (
      (arrayCandidate && prototype !== Array.prototype) ||
      (!arrayCandidate && prototype !== Object.prototype && prototype !== null)
    ) {
      return [
        diagnostic(
          "boundary.prototype.unsupported",
          "Runtime boundary objects must use plain object or array prototypes.",
          path,
        ),
      ];
    }
    let descriptors: PropertyDescriptorMap;
    try {
      descriptors = Object.getOwnPropertyDescriptors(candidate);
    } catch {
      return [
        diagnostic(
          "boundary.inspect.failed",
          "Runtime boundary could not be safely inspected.",
          path,
        ),
      ];
    }
    const descriptorKeys = Reflect.ownKeys(descriptors);
    inspectedEntries += descriptorKeys.length;
    if (inspectedEntries > maxEntries) {
      return [
        diagnostic(
          "boundary.size.exceeded",
          "Runtime boundary contains too many properties or array entries.",
          path,
        ),
      ];
    }
    if (arrayCandidate) {
      const length = descriptors.length?.value as unknown;
      let elementCount = 0;
      for (const key of Object.keys(descriptors)) {
        if (!/^(?:0|[1-9]\d*)$/.test(key)) continue;
        const index = Number(key);
        if (
          Number.isSafeInteger(index) &&
          index >= 0 &&
          index < 4_294_967_295 &&
          String(index) === key
        ) {
          elementCount += 1;
        }
      }
      if (typeof length !== "number" || elementCount !== length) {
        return [
          diagnostic(
            "boundary.array.sparse",
            "Sparse arrays are not supported at runtime boundaries.",
            path,
          ),
        ];
      }
    }
    const nestedValues: (typeof pending)[number][] = [];
    for (const key of descriptorKeys) {
      if (typeof key === "symbol") {
        return [
          diagnostic(
            "boundary.symbol.unsupported",
            "Symbol properties are not supported at runtime boundaries.",
            path,
          ),
        ];
      }
      if (arrayCandidate && key === "length") continue;
      const descriptor = descriptors[key];
      if (descriptor === undefined) continue;
      const part = arrayCandidate && /^\d+$/.test(key) ? Number(key) : key;
      const nextPath = [...path, part];
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        return [
          diagnostic(
            "boundary.accessor.unsupported",
            "Accessor properties are not supported at runtime boundaries.",
            nextPath,
          ),
        ];
      }
      nestedValues.push({
        candidate: descriptor.value,
        path: nextPath,
        depth: depth + 1,
      });
    }
    // LIFO traversal should retain descriptor order so diagnostics remain stable.
    for (let index = nestedValues.length - 1; index >= 0; index -= 1) {
      const nested = nestedValues[index];
      if (nested !== undefined) pending.push(nested);
    }
  }

  return [];
}

/**
 * Copies an already validated runtime boundary by reading property descriptors,
 * never property values. Call validateDataBoundary first when the source is
 * untrusted; this function can throw if a proxy changes shape between reads.
 */
export function snapshotDataBoundary(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    typeof value === "function"
  ) {
    return value;
  }
  const existing = seen.get(value);
  if (existing !== undefined) return existing;

  const arrayValue = Array.isArray(value);
  const prototype = Reflect.getPrototypeOf(value);
  if (
    (arrayValue && prototype !== Array.prototype) ||
    (!arrayValue && prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError("Unsupported runtime boundary prototype.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const arrayLength = descriptors.length?.value as unknown;
  if (
    arrayValue &&
    (typeof arrayLength !== "number" ||
      !Number.isInteger(arrayLength) ||
      arrayLength < 0 ||
      arrayLength > 4_294_967_295)
  ) {
    throw new TypeError("Invalid runtime boundary array length.");
  }
  const snapshot: unknown[] | Record<string, unknown> = arrayValue
    ? new Array<unknown>(arrayLength as number)
    : (Object.create(null) as Record<string, unknown>);
  seen.set(value, snapshot);

  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol")
      throw new TypeError("Symbol runtime boundary property.");
    if (arrayValue && key === "length") continue;
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new TypeError("Accessor runtime boundary property.");
    }
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: descriptor.enumerable === true,
      writable: true,
      value: snapshotDataBoundary(descriptor.value, seen),
    });
  }
  return snapshot;
}

/** Safely snapshots and validates hostile unknown input as inert JSON data. */
export function safeParseJsonValue(value: unknown): JsonValueParseResult {
  try {
    const boundaryDiagnostics = validateDataBoundary(value);
    if (boundaryDiagnostics.length > 0) {
      return {
        success: false,
        issues: [boundaryDiagnostics[0]?.code ?? "boundary.invalid"],
      };
    }
    const snapshot = snapshotDataBoundary(value);
    if (!isJsonValue(snapshot)) {
      return { success: false, issues: ["value is not finite, acyclic JSON"] };
    }
    return { success: true, value: snapshot };
  } catch {
    return { success: false, issues: ["value could not be safely inspected"] };
  }
}

function validIdentifier(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !IDENTIFIER.test(value)
  ) {
    return false;
  }
  return !value
    .split(".")
    .some((segment) => UNSAFE_IDENTIFIER_SEGMENTS.has(segment));
}

interface ComponentConstraint {
  readonly min: number;
  readonly max?: number;
  readonly maxInclusive?: boolean;
  readonly notation: string;
}

const UNIT_INTERVAL_SPACES = new Set([
  "srgb",
  "srgb-linear",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d50",
  "xyz-d65",
]);

function componentConstraint(
  colorSpace: string,
  index: number,
): ComponentConstraint | undefined {
  if (UNIT_INTERVAL_SPACES.has(colorSpace)) {
    return { min: 0, max: 1, maxInclusive: true, notation: "[0, 1]" };
  }
  if (colorSpace === "hsl" || colorSpace === "hwb") {
    return index === 0
      ? { min: 0, max: 360, maxInclusive: false, notation: "[0, 360)" }
      : { min: 0, max: 100, maxInclusive: true, notation: "[0, 100]" };
  }
  if (colorSpace === "lab") {
    return index === 0
      ? { min: 0, max: 100, maxInclusive: true, notation: "[0, 100]" }
      : undefined;
  }
  if (colorSpace === "lch") {
    if (index === 0)
      return { min: 0, max: 100, maxInclusive: true, notation: "[0, 100]" };
    if (index === 1) return { min: 0, notation: "[0, Infinity)" };
    return { min: 0, max: 360, maxInclusive: false, notation: "[0, 360)" };
  }
  if (colorSpace === "oklab") {
    return index === 0
      ? { min: 0, max: 1, maxInclusive: true, notation: "[0, 1]" }
      : undefined;
  }
  if (colorSpace === "oklch") {
    if (index === 0)
      return { min: 0, max: 1, maxInclusive: true, notation: "[0, 1]" };
    if (index === 1) return { min: 0, notation: "[0, Infinity)" };
    return { min: 0, max: 360, maxInclusive: false, notation: "[0, 360)" };
  }
  return undefined;
}

function inComponentRange(
  value: number,
  constraint: ComponentConstraint,
): boolean {
  if (value < constraint.min) return false;
  if (constraint.max === undefined) return true;
  return constraint.maxInclusive === false
    ? value < constraint.max
    : value <= constraint.max;
}

function validateStructuredColor(
  value: unknown,
  path: readonly (string | number)[],
): ThemeDiagnostic[] {
  const diagnostics: ThemeDiagnostic[] = [];
  if (!isObject(value))
    return [
      diagnostic(
        "project.color.invalid",
        "Color value must be an object.",
        path,
      ),
    ];

  if (!isColorSpace(value.colorSpace)) {
    diagnostics.push(
      diagnostic(
        "project.color-space.unsupported",
        `colorSpace must be one of: ${COLOR_SPACES.join(", ")}.`,
        [...path, "colorSpace"],
      ),
    );
  }

  if (!Array.isArray(value.components) || value.components.length !== 3) {
    diagnostics.push(
      diagnostic(
        "project.components.invalid",
        "Color components must contain exactly three values.",
        [...path, "components"],
      ),
    );
  } else {
    value.components.forEach((component, index) => {
      if (
        component !== "none" &&
        (typeof component !== "number" || !Number.isFinite(component))
      ) {
        diagnostics.push(
          diagnostic(
            "project.component.invalid",
            'A color component must be a finite number or "none".',
            [...path, "components", index],
          ),
        );
      } else if (
        typeof component === "number" &&
        isColorSpace(value.colorSpace)
      ) {
        const constraint = componentConstraint(value.colorSpace, index);
        if (
          constraint !== undefined &&
          !inComponentRange(component, constraint)
        ) {
          diagnostics.push(
            diagnostic(
              "project.component.out-of-range",
              `${value.colorSpace} component ${index} must be in ${constraint.notation} or use "none".`,
              [...path, "components", index],
            ),
          );
        }
      }
    });
  }

  if (
    value.alpha !== undefined &&
    (typeof value.alpha !== "number" ||
      !Number.isFinite(value.alpha) ||
      value.alpha < 0 ||
      value.alpha > 1)
  ) {
    diagnostics.push(
      diagnostic(
        "project.alpha.invalid",
        "Color alpha must be a finite number between 0 and 1.",
        [...path, "alpha"],
      ),
    );
  }

  if (value.hex !== undefined) {
    if (!isDtcgHex(value.hex)) {
      diagnostics.push(
        diagnostic(
          "project.hex.invalid",
          "DTCG color hex fallback must be exactly #RRGGBB; alpha belongs in the alpha field.",
          [...path, "hex"],
        ),
      );
    } else if (
      value.colorSpace === "srgb" &&
      Array.isArray(value.components) &&
      value.components.length === 3
    ) {
      const parsed = parseHexColor(value.hex);
      const numericComponents = value.components.every(
        (component) => typeof component === "number",
      );
      if (numericComponents) {
        const mismatch = value.components.some(
          (component, index) =>
            typeof component === "number" &&
            Math.abs(component - (parsed.components[index] as number)) >
              1 / 510,
        );
        if (mismatch) {
          diagnostics.push(
            diagnostic(
              "project.hex.mismatch",
              "The sRGB hex fallback does not match the structured RGB components.",
              [...path, "hex"],
            ),
          );
        }
      }
    }
  }
  return diagnostics;
}

export function validateThemeProject(
  project: unknown,
  limits: CompilerLimits,
): ThemeDiagnostic[] {
  const diagnostics: ThemeDiagnostic[] = [];
  if (!isObject(project))
    return [diagnostic("project.invalid", "Theme project must be an object.")];
  if (project.schemaVersion !== "1.0") {
    diagnostics.push(
      diagnostic(
        "project.schema-version.unsupported",
        'schemaVersion must be exactly "1.0".',
        ["schemaVersion"],
      ),
    );
  }
  if (!validIdentifier(project.id)) {
    diagnostics.push(
      diagnostic(
        "project.id.invalid",
        "Project id must be a safe dot-separated identifier.",
        ["id"],
      ),
    );
  }
  if (
    project.name !== undefined &&
    (typeof project.name !== "string" || project.name.length > 256)
  ) {
    diagnostics.push(
      diagnostic(
        "project.name.invalid",
        "Project name must be at most 256 characters.",
        ["name"],
      ),
    );
  }

  const primitiveIds = new Set<string>();
  if (!Array.isArray(project.primitives)) {
    diagnostics.push(
      diagnostic(
        "project.primitives.invalid",
        "Project primitives must be an array.",
        ["primitives"],
      ),
    );
  } else {
    if (project.primitives.length === 0) {
      diagnostics.push(
        diagnostic(
          "project.primitives.empty",
          "At least one color primitive is required.",
          ["primitives"],
        ),
      );
    }
    if (project.primitives.length > limits.maxPrimitives) {
      diagnostics.push(
        diagnostic(
          "limit.primitives.exceeded",
          `Project exceeds the ${limits.maxPrimitives} primitive limit.`,
          ["primitives"],
        ),
      );
    }
    project.primitives.forEach((primitive, index) => {
      const path = ["primitives", index] as const;
      if (!isObject(primitive)) {
        diagnostics.push(
          diagnostic(
            "project.primitive.invalid",
            "Primitive must be an object.",
            path,
          ),
        );
        return;
      }
      if (!validIdentifier(primitive.id)) {
        diagnostics.push(
          diagnostic(
            "project.primitive-id.invalid",
            "Primitive id must be a safe identifier.",
            [...path, "id"],
          ),
        );
      } else if (primitiveIds.has(primitive.id)) {
        diagnostics.push(
          diagnostic(
            "project.primitive-id.duplicate",
            `Duplicate primitive id ${primitive.id}.`,
            [...path, "id"],
          ),
        );
      } else {
        primitiveIds.add(primitive.id);
      }
      if (primitive.$type !== "color") {
        diagnostics.push(
          diagnostic(
            "project.primitive-type.unsupported",
            'Primitive $type must be "color".',
            [...path, "$type"],
          ),
        );
      }
      if (
        primitive.label !== undefined &&
        (typeof primitive.label !== "string" || primitive.label.length > 256)
      ) {
        diagnostics.push(
          diagnostic(
            "project.primitive-label.invalid",
            "Primitive label must be at most 256 characters.",
            [...path, "label"],
          ),
        );
      }
      diagnostics.push(
        ...validateStructuredColor(primitive.value, [...path, "value"]),
      );
    });
  }

  const schemeIds = new Set<string>();
  if (!Array.isArray(project.schemes)) {
    diagnostics.push(
      diagnostic(
        "project.schemes.invalid",
        "Project schemes must be an array.",
        ["schemes"],
      ),
    );
  } else {
    if (project.schemes.length > limits.maxSchemes) {
      diagnostics.push(
        diagnostic(
          "limit.schemes.exceeded",
          `Project exceeds the ${limits.maxSchemes} scheme limit.`,
          ["schemes"],
        ),
      );
    }
    project.schemes.forEach((scheme, index) => {
      const path = ["schemes", index] as const;
      if (!isObject(scheme)) {
        diagnostics.push(
          diagnostic(
            "project.scheme.invalid",
            "Scheme must be an object.",
            path,
          ),
        );
        return;
      }
      if (!validIdentifier(scheme.id)) {
        diagnostics.push(
          diagnostic(
            "project.scheme-id.invalid",
            "Scheme id must be a safe identifier.",
            [...path, "id"],
          ),
        );
      } else if (schemeIds.has(scheme.id)) {
        diagnostics.push(
          diagnostic(
            "project.scheme-id.duplicate",
            `Duplicate scheme id ${scheme.id}.`,
            [...path, "id"],
          ),
        );
      } else {
        schemeIds.add(scheme.id);
      }
      if (
        scheme.label !== undefined &&
        (typeof scheme.label !== "string" || scheme.label.length > 256)
      ) {
        diagnostics.push(
          diagnostic(
            "project.scheme-label.invalid",
            "Scheme label must be at most 256 characters.",
            [...path, "label"],
          ),
        );
      }
      if (!isObject(scheme.roles)) {
        diagnostics.push(
          diagnostic(
            "project.roles.invalid",
            "Scheme roles must be an object.",
            [...path, "roles"],
          ),
        );
        return;
      }
      const entries = Object.entries(scheme.roles);
      if (entries.length > limits.maxRolesPerScheme) {
        diagnostics.push(
          diagnostic(
            "limit.roles.exceeded",
            `Scheme exceeds the ${limits.maxRolesPerScheme} role limit.`,
            [...path, "roles"],
          ),
        );
      }
      for (const [role, reference] of entries) {
        if (!validIdentifier(role)) {
          diagnostics.push(
            diagnostic(
              "project.role.invalid",
              `Role ${JSON.stringify(role)} is not a safe identifier.`,
              [...path, "roles", role],
            ),
          );
        }
        if (!isObject(reference) || typeof reference.ref !== "string") {
          diagnostics.push(
            diagnostic(
              "project.reference.invalid",
              "A semantic role must contain a primitive ref.",
              [...path, "roles", role],
            ),
          );
        } else if (!primitiveIds.has(reference.ref)) {
          diagnostics.push(
            diagnostic(
              "project.reference.unresolved",
              `Role ${role} references unknown primitive ${reference.ref}.`,
              [...path, "roles", role, "ref"],
            ),
          );
        }
      }
    });
  }
  return diagnostics;
}

function manifestDiagnostic(
  adapterId: string,
  code: string,
  message: string,
): ThemeDiagnostic {
  return { severity: "error", code, message, adapterId };
}

const OPTION_FORMATS = new Set([
  "identifier",
  "file-stem",
  "css-selector",
  "css-variable-prefix",
]);

function validOptionDefinition(value: unknown): boolean {
  if (
    !isObject(value) ||
    typeof value.description !== "string" ||
    value.description.length === 0 ||
    value.description.length > 512
  ) {
    return false;
  }
  switch (value.type) {
    case "string":
      return (
        typeof value.default === "string" &&
        (value.format === undefined ||
          (typeof value.format === "string" &&
            OPTION_FORMATS.has(value.format)))
      );
    case "boolean":
      return typeof value.default === "boolean";
    case "number":
      return (
        typeof value.default === "number" &&
        Number.isFinite(value.default) &&
        (value.minimum === undefined ||
          (typeof value.minimum === "number" &&
            Number.isFinite(value.minimum) &&
            value.default >= value.minimum)) &&
        (value.maximum === undefined ||
          (typeof value.maximum === "number" &&
            Number.isFinite(value.maximum) &&
            value.default <= value.maximum)) &&
        (typeof value.minimum !== "number" ||
          typeof value.maximum !== "number" ||
          value.minimum <= value.maximum)
      );
    case "enum":
      return (
        typeof value.default === "string" &&
        Array.isArray(value.values) &&
        value.values.length > 0 &&
        value.values.every(
          (entry) => typeof entry === "string" && entry.length > 0,
        ) &&
        value.values.includes(value.default)
      );
    default:
      return false;
  }
}

function optionValueMatches(definition: unknown, value: unknown): boolean {
  if (!validOptionDefinition(definition) || !isObject(definition)) return false;
  switch (definition.type) {
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (typeof definition.minimum !== "number" ||
          value >= definition.minimum) &&
        (typeof definition.maximum !== "number" || value <= definition.maximum)
      );
    case "enum":
      return (
        typeof value === "string" &&
        Array.isArray(definition.values) &&
        definition.values.includes(value)
      );
    default:
      return false;
  }
}

export function validateAdapter(adapter: unknown): ThemeDiagnostic[] {
  const diagnostics: ThemeDiagnostic[] = [];
  if (
    !isObject(adapter) ||
    typeof adapter.compile !== "function" ||
    !isObject(adapter.manifest)
  ) {
    return [
      diagnostic(
        "adapter.invalid",
        "Adapter must expose a manifest and compile function.",
      ),
    ];
  }
  const manifest = adapter.manifest;
  const adapterId = typeof manifest.id === "string" ? manifest.id : "unknown";
  if (!ADAPTER_ID.test(adapterId)) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.id.invalid",
        "Adapter id must include a version suffix.",
      ),
    );
  }
  if (
    typeof manifest.name !== "string" ||
    manifest.name.length === 0 ||
    manifest.name.length > 128
  ) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.name.invalid",
        "Adapter name is invalid.",
      ),
    );
  }
  if (
    typeof manifest.adapterVersion !== "string" ||
    manifest.adapterVersion.length === 0
  ) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.version.invalid",
        "Adapter implementation version is required.",
      ),
    );
  }
  if (manifest.engineApiVersion !== "1") {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.engine-api.unsupported",
        'Adapter engineApiVersion must be exactly "1".',
      ),
    );
  }
  if (
    manifest.maturity !== "stable" &&
    manifest.maturity !== "beta" &&
    manifest.maturity !== "experimental"
  ) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.maturity.invalid",
        "Adapter maturity must be stable, beta, or experimental.",
      ),
    );
  }
  if (
    !isObject(manifest.target) ||
    typeof manifest.target.name !== "string" ||
    typeof manifest.target.version !== "string"
  ) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.target.invalid",
        "Adapter target is invalid.",
      ),
    );
  }
  if (!isObject(manifest.capabilities)) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.capabilities.invalid",
        "Adapter capabilities are required.",
      ),
    );
  } else {
    const { colors, schemes, roles, preview } = manifest.capabilities;
    if (
      !isObject(colors) ||
      (colors.native !== "passthrough" &&
        (!Array.isArray(colors.native) ||
          colors.native.some((colorSpace) => !isColorSpace(colorSpace)))) ||
      (colors.fallback !== "none" && colors.fallback !== "srgb-hex")
    ) {
      diagnostics.push(
        manifestDiagnostic(
          adapterId,
          "adapter.color-spaces.invalid",
          "Adapter color capability profile is invalid.",
        ),
      );
    }
    if (
      !isObject(schemes) ||
      (schemes.count !== "none" &&
        schemes.count !== "single" &&
        schemes.count !== "multiple") ||
      (schemes.ids !== "any" &&
        (!Array.isArray(schemes.ids) ||
          schemes.ids.some((id) => !validIdentifier(id))))
    ) {
      diagnostics.push(
        manifestDiagnostic(
          adapterId,
          "adapter.schemes.invalid",
          "Adapter schemes capability is invalid.",
        ),
      );
    }
    if (
      !isObject(roles) ||
      (roles.requirement !== "none" &&
        roles.requirement !== "optional" &&
        roles.requirement !== "required") ||
      (roles.supported !== "any" &&
        (!Array.isArray(roles.supported) ||
          roles.supported.some((role) => !validIdentifier(role)))) ||
      !Array.isArray(roles.required) ||
      roles.required.some((role) => !validIdentifier(role)) ||
      (Array.isArray(roles.supported) &&
        roles.required.some(
          (role) => !(roles.supported as unknown[]).includes(role),
        )) ||
      (roles.requirement === "none" && roles.required.length > 0)
    ) {
      diagnostics.push(
        manifestDiagnostic(
          adapterId,
          "adapter.semantic-roles.invalid",
          "Adapter semantic role capability profile is invalid.",
        ),
      );
    }
    if (typeof preview !== "boolean") {
      diagnostics.push(
        manifestDiagnostic(
          adapterId,
          "adapter.preview.invalid",
          "Adapter preview capability is invalid.",
        ),
      );
    }
  }
  if (!isObject(manifest.options)) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.options.invalid",
        "Adapter option definitions are required.",
      ),
    );
  } else {
    for (const [name, definition] of Object.entries(manifest.options)) {
      if (!validIdentifier(name) || !validOptionDefinition(definition)) {
        diagnostics.push(
          manifestDiagnostic(
            adapterId,
            "adapter.option.invalid",
            `Adapter option ${JSON.stringify(name)} is invalid.`,
          ),
        );
      }
    }
  }
  if (
    adapter.configuration !== undefined &&
    !isJsonValue(adapter.configuration)
  ) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.configuration.invalid",
        "Adapter configuration must be finite, acyclic JSON data.",
      ),
    );
  } else if (adapter.configuration !== undefined) {
    if (!isObject(adapter.configuration) || !isObject(manifest.options)) {
      diagnostics.push(
        manifestDiagnostic(
          adapterId,
          "adapter.configuration.invalid",
          "Adapter configuration must be an object matching its option definitions.",
        ),
      );
    } else {
      const optionDefinitions = manifest.options;
      const configuration = adapter.configuration as Record<string, unknown>;
      const optionNames = Object.keys(optionDefinitions);
      const configurationNames = Object.keys(configuration);
      const complete = optionNames.every((name) =>
        Object.hasOwn(configuration, name),
      );
      const known = configurationNames.every((name) =>
        Object.hasOwn(optionDefinitions, name),
      );
      const validValues = optionNames.every((name) =>
        optionValueMatches(optionDefinitions[name], configuration[name]),
      );
      if (!complete || !known || !validValues) {
        diagnostics.push(
          manifestDiagnostic(
            adapterId,
            "adapter.configuration.invalid",
            "Adapter configuration must contain one normalized value for every declared option and no unknown values.",
          ),
        );
      }
    }
  } else if (
    isObject(manifest.options) &&
    Object.keys(manifest.options).length > 0
  ) {
    diagnostics.push(
      manifestDiagnostic(
        adapterId,
        "adapter.configuration.required",
        "Adapters with declared options must expose normalized configuration.",
      ),
    );
  }
  return diagnostics;
}

export function validateAdapterCompatibility(
  project: ThemeProject,
  manifest: ThemeAdapterManifest,
): ThemeDiagnostic[] {
  const diagnostics: ThemeDiagnostic[] = [];
  const error = (code: string, message: string): void => {
    diagnostics.push({
      severity: "error",
      code,
      message,
      adapterId: manifest.id,
    });
  };
  const { schemes, roles, colors } = manifest.capabilities;
  if (schemes.count === "none" && project.schemes.length > 0) {
    diagnostics.push({
      severity: "warning",
      code: "adapter.schemes.ignored",
      message: `${manifest.id} does not consume schemes; semantic bindings will be ignored.`,
      adapterId: manifest.id,
    });
  }
  if (schemes.count === "single" && project.schemes.length > 1) {
    error(
      "adapter.schemes.exceeded",
      `${manifest.id} supports one scheme but the project contains ${project.schemes.length}.`,
    );
  }
  if (schemes.ids !== "any") {
    const supportedSchemeIds = new Set(schemes.ids);
    for (const scheme of project.schemes) {
      if (!supportedSchemeIds.has(scheme.id)) {
        error(
          "adapter.scheme-id.unsupported",
          `${manifest.id} does not support scheme id ${scheme.id}.`,
        );
      }
    }
  }
  if (roles.requirement === "required" && project.schemes.length === 0) {
    error(
      "adapter.scheme.required",
      `${manifest.id} requires at least one explicit semantic scheme.`,
    );
  }
  for (const scheme of project.schemes) {
    for (const role of roles.required) {
      if (!Object.hasOwn(scheme.roles, role)) {
        error(
          "adapter.role.required",
          `${manifest.id} requires role ${role} in scheme ${scheme.id}.`,
        );
      }
    }
  }
  if (colors.native !== "passthrough") {
    const supported = new Set(colors.native);
    const supportedRoles =
      roles.supported === "any" ? undefined : new Set(roles.supported);
    const referencedPrimitives = new Set<string>();
    if (roles.requirement !== "none") {
      for (const scheme of project.schemes) {
        for (const [role, reference] of Object.entries(scheme.roles)) {
          if (supportedRoles === undefined || supportedRoles.has(role)) {
            referencedPrimitives.add(reference.ref);
          }
        }
      }
    }
    const candidates =
      roles.requirement === "none"
        ? project.primitives
        : project.primitives.filter((primitive) =>
            referencedPrimitives.has(primitive.id),
          );
    for (const primitive of candidates) {
      const hasFallback =
        colors.fallback === "srgb-hex" && isDtcgHex(primitive.value.hex);
      if (!supported.has(primitive.value.colorSpace) && !hasFallback) {
        error(
          "adapter.color-space.unsupported",
          `${manifest.id} does not support ${primitive.value.colorSpace} used by ${primitive.id}.`,
        );
      }
    }
  }
  return diagnostics;
}

export function validateDiagnostic(
  value: unknown,
  adapterId: string,
): ThemeDiagnostic | undefined {
  if (!isObject(value)) return undefined;
  if (
    value.severity !== "error" &&
    value.severity !== "warning" &&
    value.severity !== "info"
  )
    return undefined;
  if (typeof value.code !== "string" || !DIAGNOSTIC_CODE.test(value.code))
    return undefined;
  if (
    typeof value.message !== "string" ||
    value.message.length === 0 ||
    value.message.length > 4_096
  )
    return undefined;
  if (
    value.path !== undefined &&
    (!Array.isArray(value.path) ||
      value.path.some((part) =>
        typeof part === "string"
          ? part.length > 256
          : typeof part !== "number" || !Number.isSafeInteger(part),
      ))
  ) {
    return undefined;
  }
  const normalized: ThemeDiagnostic = {
    severity: value.severity,
    code: value.code,
    message: value.message,
    adapterId,
  };
  return value.path === undefined
    ? normalized
    : {
        ...normalized,
        path: Object.freeze([...(value.path as readonly (string | number)[])]),
      };
}

export function validateArtifact(
  artifact: unknown,
  adapterId: string,
  limits: CompilerLimits,
): {
  artifact?: VirtualArtifact;
  diagnostics: ThemeDiagnostic[];
  bytes: number;
} {
  const diagnostics: ThemeDiagnostic[] = [];
  const fail = (code: string, message: string): void => {
    diagnostics.push({ severity: "error", code, message, adapterId });
  };
  if (!isObject(artifact)) {
    fail("artifact.invalid", "Adapter returned a non-object artifact.");
    return { diagnostics, bytes: 0 };
  }
  const { path, mediaType, content } = artifact;
  if (
    typeof path !== "string" ||
    !isSafeArtifactPath(path, limits.maxPathLength)
  ) {
    fail(
      "artifact.path.unsafe",
      `Adapter returned unsafe artifact path ${JSON.stringify(path)}.`,
    );
  }
  if (
    typeof mediaType !== "string" ||
    mediaType.length > 256 ||
    !MEDIA_TYPE.test(mediaType)
  ) {
    fail(
      "artifact.media-type.invalid",
      "Adapter returned an invalid media type.",
    );
  }
  if (typeof content !== "string") {
    fail(
      "artifact.content.invalid",
      "Adapter artifact content must be a string.",
    );
  }
  const bytes =
    typeof content === "string"
      ? new TextEncoder().encode(content).byteLength
      : 0;
  if (bytes > limits.maxArtifactBytes) {
    fail(
      "limit.artifact-bytes.exceeded",
      `Artifact exceeds the ${limits.maxArtifactBytes} byte limit.`,
    );
  }
  if (
    diagnostics.length > 0 ||
    typeof path !== "string" ||
    typeof mediaType !== "string" ||
    typeof content !== "string"
  ) {
    return { diagnostics, bytes };
  }
  return {
    artifact: { path: path.normalize("NFC"), mediaType, content },
    diagnostics,
    bytes,
  };
}

export function isSafeArtifactPath(path: string, maxLength: number): boolean {
  if (
    path.length === 0 ||
    path.length > maxLength ||
    path !== path.normalize("NFC") ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\") ||
    [...path].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return false;
  }
  const segments = path.split("/");
  const windowsDevice = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  return segments.every(
    (segment) =>
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      !segment.includes(":") &&
      !segment.endsWith(".") &&
      !segment.endsWith(" ") &&
      !windowsDevice.test(segment),
  );
}

export function isJsonValue(
  value: unknown,
  seen = new Set<object>(),
): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const valid = value.every((entry) => isJsonValue(entry, seen));
    seen.delete(value);
    return valid;
  }
  if (!isObject(value)) return false;
  const valid = Object.entries(value).every(
    ([key, entry]) => key !== "__proto__" && isJsonValue(entry, seen),
  );
  seen.delete(value);
  return valid;
}

export function mergeLimits(overrides: unknown): {
  limits: CompilerLimits;
  diagnostics: ThemeDiagnostic[];
} {
  if (overrides === undefined)
    return { limits: DEFAULT_COMPILER_LIMITS, diagnostics: [] };
  if (!isObject(overrides)) {
    return {
      limits: DEFAULT_COMPILER_LIMITS,
      diagnostics: [
        diagnostic("limits.invalid", "Compiler limits must be an object."),
      ],
    };
  }
  const limits = { ...DEFAULT_COMPILER_LIMITS };
  const diagnostics: ThemeDiagnostic[] = [];
  for (const key of Object.keys(
    DEFAULT_COMPILER_LIMITS,
  ) as (keyof CompilerLimits)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      diagnostics.push(
        diagnostic(
          "limits.value.invalid",
          `${key} must be a positive safe integer.`,
          ["limits", key],
        ),
      );
    } else {
      limits[key] = value;
    }
  }
  const unknownKeys = Object.keys(overrides).filter(
    (key) => !(key in DEFAULT_COMPILER_LIMITS),
  );
  for (const key of unknownKeys) {
    diagnostics.push(
      diagnostic("limits.key.unknown", `Unknown compiler limit ${key}.`, [
        "limits",
        key,
      ]),
    );
  }
  return { limits: Object.freeze(limits), diagnostics };
}

export function adapterIdOf(adapter: ThemeAdapter): string {
  return adapter.manifest.id;
}
