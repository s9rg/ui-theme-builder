export const THEME_PROJECT_SCHEMA_VERSION = "1.0" as const;

export type ThemeProjectSchemaVersion = typeof THEME_PROJECT_SCHEMA_VERSION;

/** Color spaces named by the DTCG Color specification. */
export type ColorSpace =
  | "srgb"
  | "srgb-linear"
  | "hsl"
  | "hwb"
  | "lab"
  | "lch"
  | "oklab"
  | "oklch"
  | "display-p3"
  | "a98-rgb"
  | "prophoto-rgb"
  | "rec2020"
  | "xyz-d50"
  | "xyz-d65";

export type ColorComponent = number | "none";

/**
 * A lossless, DTCG-shaped color value. The compiler intentionally does not
 * coerce CSS color strings into this structure.
 */
export interface StructuredColor {
  readonly colorSpace: ColorSpace;
  readonly components: readonly [
    ColorComponent,
    ColorComponent,
    ColorComponent,
  ];
  readonly alpha?: number;
  readonly hex?: string;
}

export interface ResolvedColor {
  readonly colorSpace: ColorSpace;
  readonly components: readonly [
    ColorComponent,
    ColorComponent,
    ColorComponent,
  ];
  readonly alpha: number;
  readonly hex?: string;
}

export interface ColorPrimitive {
  readonly id: string;
  readonly $type: "color";
  readonly value: StructuredColor;
  readonly label?: string;
}

export interface ColorReference {
  readonly ref: string;
}

/** Semantic bindings are always explicit. The compiler never infers roles. */
export interface ThemeScheme {
  readonly id: string;
  readonly label?: string;
  readonly roles: Readonly<Record<string, ColorReference>>;
}

export interface ThemeProject {
  readonly schemaVersion: ThemeProjectSchemaVersion;
  readonly id: string;
  readonly name?: string;
  readonly primitives: readonly ColorPrimitive[];
  readonly schemes: readonly ThemeScheme[];
}

export interface ResolvedPrimitive {
  readonly id: string;
  readonly $type: "color";
  readonly value: ResolvedColor;
  readonly label?: string;
}

export interface ResolvedRole {
  readonly role: string;
  readonly ref: string;
  readonly value: ResolvedColor;
}

export interface ResolvedScheme {
  readonly id: string;
  readonly label?: string;
  readonly roles: Readonly<Record<string, ResolvedRole>>;
}

/** Immutable, fully resolved input passed to every adapter. */
export interface ThemeGraph {
  readonly schemaVersion: ThemeProjectSchemaVersion;
  readonly projectId: string;
  readonly projectName?: string;
  readonly primitives: readonly ResolvedPrimitive[];
  readonly schemes: readonly ResolvedScheme[];
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface ThemeDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly adapterId?: string;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type JsonValueParseResult =
  | { readonly success: true; readonly value: JsonValue }
  | { readonly success: false; readonly issues: readonly string[] };

/** A virtual file returned by an adapter before compiler validation. */
export interface VirtualArtifact {
  readonly path: string;
  readonly mediaType: string;
  readonly content: string;
}

/** A virtual file that passed compiler validation and has an owner. */
export interface CompiledArtifact extends VirtualArtifact {
  readonly adapterId: string;
}

export interface ThemeAdapterTarget {
  readonly name: string;
  /** Target version or supported range, for example "4.x" or ">=9 <10". */
  readonly version: string;
}

export interface ThemeAdapterColorCapabilities {
  /** Color spaces emitted natively without conversion. */
  readonly native: readonly ColorSpace[] | "passthrough";
  /** Optional structured-color fallback understood by this adapter. */
  readonly fallback: "none" | "srgb-hex";
}

export interface ThemeAdapterSchemeCapabilities {
  readonly count: "none" | "single" | "multiple";
  /** Accepted authored scheme IDs, or `any` when identifiers are open. */
  readonly ids: readonly string[] | "any";
}

export interface ThemeAdapterRoleCapabilities {
  readonly requirement: "none" | "optional" | "required";
  /** Roles consumed by the target, or `any` for open token targets. */
  readonly supported: readonly string[] | "any";
  /** Roles required in every authored scheme. */
  readonly required: readonly string[];
}

export interface ThemeAdapterCapabilities {
  readonly colors: ThemeAdapterColorCapabilities;
  readonly schemes: ThemeAdapterSchemeCapabilities;
  readonly roles: ThemeAdapterRoleCapabilities;
  readonly preview: boolean;
}

export type ThemeAdapterOptionFormat =
  "identifier" | "file-stem" | "css-selector" | "css-variable-prefix";

export type ThemeAdapterOptionDefinition =
  | {
      readonly type: "string";
      readonly default: string;
      readonly description: string;
      readonly format?: ThemeAdapterOptionFormat;
    }
  | {
      readonly type: "boolean";
      readonly default: boolean;
      readonly description: string;
    }
  | {
      readonly type: "number";
      readonly default: number;
      readonly description: string;
      readonly minimum?: number;
      readonly maximum?: number;
    }
  | {
      readonly type: "enum";
      readonly default: string;
      readonly description: string;
      readonly values: readonly string[];
    };

export type ThemeAdapterMaturity = "stable" | "beta" | "experimental";

/**
 * Adapter ids include their target contract version (for example tailwind@4).
 * adapterVersion independently identifies the implementation version.
 */
export interface ThemeAdapterManifest {
  readonly id: string;
  readonly name: string;
  /** Compiler/adapter ABI version, independent of the target version. */
  readonly engineApiVersion: "1";
  readonly adapterVersion: string;
  readonly maturity: ThemeAdapterMaturity;
  readonly target: ThemeAdapterTarget;
  readonly capabilities: ThemeAdapterCapabilities;
  /** Public option schema used by hosts and documentation tooling. */
  readonly options: Readonly<Record<string, ThemeAdapterOptionDefinition>>;
}

export interface ThemeCompileContext {
  readonly signal?: AbortSignal;
}

export interface ThemeAdapterOutput {
  readonly artifacts: readonly VirtualArtifact[];
  readonly diagnostics?: readonly ThemeDiagnostic[];
  readonly preview?: JsonValue;
}

export interface ThemeAdapter {
  readonly manifest: ThemeAdapterManifest;
  /**
   * Normalized, non-secret adapter configuration. When present, the compiler
   * snapshots it and records it in theme.lock.json.
   */
  readonly configuration?: JsonValue;
  readonly compile: (
    graph: ThemeGraph,
    context: ThemeCompileContext,
  ) => ThemeAdapterOutput | Promise<ThemeAdapterOutput>;
}

export interface CompilerLimits {
  readonly maxPrimitives: number;
  readonly maxSchemes: number;
  readonly maxRolesPerScheme: number;
  readonly maxAdapters: number;
  readonly maxArtifacts: number;
  readonly maxArtifactBytes: number;
  readonly maxTotalArtifactBytes: number;
  readonly maxPathLength: number;
}

export interface CompileOptions {
  readonly signal?: AbortSignal;
  readonly limits?: Partial<CompilerLimits>;
}

export interface CompileSuccess {
  readonly ok: true;
  readonly graph: ThemeGraph;
  readonly artifacts: readonly CompiledArtifact[];
  readonly diagnostics: readonly ThemeDiagnostic[];
  readonly previews: Readonly<Record<string, JsonValue>>;
  readonly lockfile: CompiledArtifact;
}

/** A failed compile never exposes downloadable artifacts or preview payloads. */
export interface CompileFailure {
  readonly ok: false;
  readonly graph?: ThemeGraph;
  readonly diagnostics: readonly ThemeDiagnostic[];
}

export type CompileResult = CompileSuccess | CompileFailure;

export type ThemeColorInput = string | StructuredColor;
export type ThemePaletteInput =
  readonly ThemeColorInput[] | Readonly<Record<string, ThemeColorInput>>;

export interface CreateThemeProjectOptions {
  readonly id?: string;
  readonly name?: string;
  readonly schemes?: readonly ThemeScheme[];
}
