import { resolveThemeProject } from "./project";
import { sha256, stableStringify } from "./stable";
import type {
  ColorComponent,
  CompileOptions,
  CompileResult,
  CompiledArtifact,
  CompilerLimits,
  JsonValue,
  ThemeAdapter,
  ThemeAdapterManifest,
  ThemeDiagnostic,
  ThemeGraph,
  ThemeProject,
} from "./types";
import {
  isJsonValue,
  mergeLimits,
  snapshotDataBoundary,
  validateAdapter,
  validateAdapterCompatibility,
  validateArtifact,
  validateDataBoundary,
  validateDiagnostic,
  validateThemeProject,
} from "./validation";

const COMPILER_ADAPTER_ID = "compiler@1";
const LOCKFILE_PATH = "theme.lock.json";

interface LockArtifact {
  readonly path: string;
  readonly mediaType: string;
  readonly adapterId: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface ThemeLock {
  readonly schemaVersion: "1.0";
  readonly compiler: {
    readonly name: "@s9rg/theme-compiler";
    readonly contractVersion: "1";
  };
  readonly project: { readonly id: string; readonly sha256: string };
  readonly adapters: readonly {
    readonly id: string;
    readonly engineApiVersion: "1";
    readonly adapterVersion: string;
    readonly maturity: "stable" | "beta" | "experimental";
    readonly target: { readonly name: string; readonly version: string };
    readonly configuration?: JsonValue;
  }[];
  readonly artifacts: readonly LockArtifact[];
}

function hasErrors(diagnostics: readonly ThemeDiagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === "error");
}

function error(
  code: string,
  message: string,
  adapterId?: string,
): ThemeDiagnostic {
  return adapterId === undefined
    ? { severity: "error", code, message }
    : { severity: "error", code, message, adapterId };
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function isAbortFailure(cause: unknown): boolean {
  try {
    return (
      cause !== null &&
      typeof cause === "object" &&
      "name" in cause &&
      cause.name === "AbortError"
    );
  } catch {
    return false;
  }
}

function failureMessage(cause: unknown, fallback: string): string {
  try {
    if (cause instanceof Error && typeof cause.message === "string") {
      return cause.message.length > 0
        ? cause.message.slice(0, 4_096)
        : fallback;
    }
  } catch {
    // A hostile thrown proxy must not turn error reporting into another throw.
  }
  return fallback;
}

function abortResult(
  diagnostics: ThemeDiagnostic[],
  graph?: ThemeGraph,
): CompileResult {
  diagnostics.push(error("compile.aborted", "Theme compilation was aborted."));
  const result: CompileResult = { ok: false, diagnostics };
  return graph === undefined ? result : { ...result, graph };
}

function freezeColorGraph(graph: ThemeGraph): ThemeGraph {
  for (const primitive of graph.primitives) {
    Object.freeze(primitive.value.components);
    Object.freeze(primitive.value);
    Object.freeze(primitive);
  }
  for (const scheme of graph.schemes) {
    for (const role of Object.values(scheme.roles)) Object.freeze(role);
    Object.freeze(scheme.roles);
    Object.freeze(scheme);
  }
  Object.freeze(graph.primitives);
  Object.freeze(graph.schemes);
  return Object.freeze(graph);
}

function snapshotProject(project: ThemeProject): ThemeProject {
  const primitives = project.primitives.map((primitive) => {
    const mutableComponents: [ColorComponent, ColorComponent, ColorComponent] =
      [
        primitive.value.components[0],
        primitive.value.components[1],
        primitive.value.components[2],
      ];
    const components = Object.freeze(mutableComponents);
    const baseValue = {
      colorSpace: primitive.value.colorSpace,
      components,
    };
    const withAlpha =
      primitive.value.alpha === undefined
        ? baseValue
        : { ...baseValue, alpha: primitive.value.alpha };
    const value = Object.freeze(
      primitive.value.hex === undefined
        ? withAlpha
        : { ...withAlpha, hex: primitive.value.hex },
    );
    const base = { id: primitive.id, $type: "color" as const, value };
    return Object.freeze(
      primitive.label === undefined
        ? base
        : { ...base, label: primitive.label },
    );
  });
  const schemes = project.schemes.map((scheme) => {
    const roles: Record<string, { readonly ref: string }> = Object.create(
      null,
    ) as Record<string, { readonly ref: string }>;
    for (const [role, reference] of Object.entries(scheme.roles)) {
      roles[role] = Object.freeze({ ref: reference.ref });
    }
    Object.freeze(roles);
    const base = { id: scheme.id, roles };
    return Object.freeze(
      scheme.label === undefined ? base : { ...base, label: scheme.label },
    );
  });
  Object.freeze(primitives);
  Object.freeze(schemes);
  const base: ThemeProject = {
    schemaVersion: "1.0",
    id: project.id,
    primitives,
    schemes,
  };
  return Object.freeze(
    project.name === undefined ? base : { ...base, name: project.name },
  );
}

function snapshotManifest(
  manifest: ThemeAdapterManifest,
): ThemeAdapterManifest {
  const nativeColorSpaces =
    manifest.capabilities.colors.native === "passthrough"
      ? "passthrough"
      : Object.freeze([...manifest.capabilities.colors.native]);
  const schemeIds =
    manifest.capabilities.schemes.ids === "any"
      ? "any"
      : Object.freeze([...manifest.capabilities.schemes.ids]);
  const supportedRoles =
    manifest.capabilities.roles.supported === "any"
      ? "any"
      : Object.freeze([...manifest.capabilities.roles.supported]);
  const options = Object.fromEntries(
    Object.entries(manifest.options).map(([name, definition]) => [
      name,
      Object.freeze(
        definition.type === "enum"
          ? { ...definition, values: Object.freeze([...definition.values]) }
          : { ...definition },
      ),
    ]),
  );
  Object.freeze(options);
  return Object.freeze({
    id: manifest.id,
    name: manifest.name,
    engineApiVersion: manifest.engineApiVersion,
    adapterVersion: manifest.adapterVersion,
    maturity: manifest.maturity,
    target: Object.freeze({
      name: manifest.target.name,
      version: manifest.target.version,
    }),
    capabilities: Object.freeze({
      colors: Object.freeze({
        native: nativeColorSpaces,
        fallback: manifest.capabilities.colors.fallback,
      }),
      schemes: Object.freeze({
        count: manifest.capabilities.schemes.count,
        ids: schemeIds,
      }),
      roles: Object.freeze({
        requirement: manifest.capabilities.roles.requirement,
        supported: supportedRoles,
        required: Object.freeze([...manifest.capabilities.roles.required]),
      }),
      preview: manifest.capabilities.preview,
    }),
    options: options,
  });
}

function snapshotAdapter(adapter: ThemeAdapter): ThemeAdapter {
  const compile = adapter.compile;
  const configuration =
    adapter.configuration === undefined
      ? undefined
      : snapshotJson(adapter.configuration);
  return Object.freeze({
    manifest: snapshotManifest(adapter.manifest),
    ...(configuration === undefined ? {} : { configuration }),
    compile,
  });
}

function snapshotJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(snapshotJson));
  const result: Record<string, JsonValue> = Object.create(null) as Record<
    string,
    JsonValue
  >;
  for (const [key, entry] of Object.entries(value))
    result[key] = snapshotJson(entry);
  return Object.freeze(result);
}

async function buildLockfile(
  project: ThemeProject,
  adapters: readonly ThemeAdapter[],
  artifacts: readonly CompiledArtifact[],
): Promise<CompiledArtifact> {
  const lockArtifacts = await Promise.all(
    artifacts.map(async (artifact): Promise<LockArtifact> => ({
      path: artifact.path,
      mediaType: artifact.mediaType,
      adapterId: artifact.adapterId,
      bytes: new TextEncoder().encode(artifact.content).byteLength,
      sha256: await sha256(artifact.content),
    })),
  );
  lockArtifacts.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );

  const lock: ThemeLock = {
    schemaVersion: "1.0",
    compiler: { name: "@s9rg/theme-compiler", contractVersion: "1" },
    project: { id: project.id, sha256: await sha256(stableStringify(project)) },
    adapters: adapters
      .map(({ manifest, configuration }) => ({
        id: manifest.id,
        engineApiVersion: manifest.engineApiVersion,
        adapterVersion: manifest.adapterVersion,
        maturity: manifest.maturity,
        target: {
          name: manifest.target.name,
          version: manifest.target.version,
        },
        ...(configuration === undefined ? {} : { configuration }),
      }))
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
    artifacts: lockArtifacts,
  };
  return {
    path: LOCKFILE_PATH,
    mediaType: "application/json",
    content: stableStringify(lock),
    adapterId: COMPILER_ADAPTER_ID,
  };
}

/**
 * Validates and resolves a project, runs isolated adapters, and returns only
 * safe virtual artifacts. A successful compile always includes theme.lock.json.
 */
export async function compileTheme(
  project: ThemeProject,
  adapters: readonly ThemeAdapter[],
  options: CompileOptions = {},
): Promise<CompileResult> {
  const diagnostics: ThemeDiagnostic[] = [];
  const artifacts: CompiledArtifact[] = [];
  const previews: Record<string, JsonValue> = Object.create(null) as Record<
    string,
    JsonValue
  >;
  const merged = mergeLimits(options.limits);
  diagnostics.push(...merged.diagnostics);
  const limits: CompilerLimits = merged.limits;

  if (aborted(options.signal)) return abortResult(diagnostics);
  const adapterBoundary = validateDataBoundary(adapters, ["adapters"]);
  diagnostics.push(...adapterBoundary);
  let adapterCandidates: readonly ThemeAdapter[] = [];
  if (adapterBoundary.length === 0) {
    try {
      const snapshot = snapshotDataBoundary(adapters);
      if (!Array.isArray(snapshot)) {
        diagnostics.push(
          error("adapters.invalid", "Adapters must be an array."),
        );
      } else {
        adapterCandidates = snapshot as readonly ThemeAdapter[];
        if (adapterCandidates.length > limits.maxAdapters) {
          diagnostics.push(
            error(
              "limit.adapters.exceeded",
              `Compile exceeds the ${limits.maxAdapters} adapter limit.`,
            ),
          );
        }
      }
    } catch {
      diagnostics.push(
        error(
          "boundary.snapshot.failed",
          "Adapters could not be safely snapshotted.",
        ),
      );
    }
  }

  const projectBoundary = validateDataBoundary(project);
  diagnostics.push(...projectBoundary);
  if (hasErrors(diagnostics)) {
    return {
      ok: false,
      diagnostics,
    };
  }
  let projectCandidate: ThemeProject;
  try {
    projectCandidate = snapshotDataBoundary(project) as ThemeProject;
  } catch {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        error(
          "boundary.snapshot.failed",
          "Theme project could not be safely snapshotted.",
        ),
      ],
    };
  }
  diagnostics.push(...validateThemeProject(projectCandidate, limits));
  if (hasErrors(diagnostics)) {
    return {
      ok: false,
      diagnostics,
    };
  }

  // Snapshot before the first await so caller or adapter mutation cannot alter
  // the graph or lockfile within one compilation.
  const projectSnapshot = snapshotProject(projectCandidate);
  const graph = freezeColorGraph(resolveThemeProject(projectSnapshot));
  const adapterIds = new Set<string>();
  const validAdapters: ThemeAdapter[] = [];
  for (
    let adapterIndex = 0;
    adapterIndex < adapterCandidates.length;
    adapterIndex += 1
  ) {
    const adapter = adapterCandidates[adapterIndex];
    if (adapter === undefined) continue;
    const boundaryValidation = validateDataBoundary(adapter, [
      "adapters",
      adapterIndex,
    ]);
    diagnostics.push(...boundaryValidation);
    if (boundaryValidation.length > 0) continue;
    const validation = validateAdapter(adapter);
    diagnostics.push(...validation);
    if (validation.some((entry) => entry.severity === "error")) continue;
    const adapterSnapshot = snapshotAdapter(adapter);
    if (adapterIds.has(adapterSnapshot.manifest.id)) {
      diagnostics.push(
        error(
          "adapter.id.duplicate",
          `Duplicate adapter id ${adapterSnapshot.manifest.id}.`,
          adapterSnapshot.manifest.id,
        ),
      );
      continue;
    }
    adapterIds.add(adapterSnapshot.manifest.id);
    const compatibility = validateAdapterCompatibility(
      projectSnapshot,
      adapterSnapshot.manifest,
    );
    diagnostics.push(...compatibility);
    if (!compatibility.some((entry) => entry.severity === "error"))
      validAdapters.push(adapterSnapshot);
  }

  if (hasErrors(diagnostics)) {
    return {
      ok: false,
      graph,
      diagnostics,
    };
  }

  const seenPaths = new Set<string>([LOCKFILE_PATH.toLocaleLowerCase("en-US")]);
  let totalBytes = 0;
  for (const adapter of validAdapters) {
    if (aborted(options.signal)) return abortResult(diagnostics, graph);
    let output: unknown;
    try {
      const context =
        options.signal === undefined ? {} : { signal: options.signal };
      output = await adapter.compile(graph, context);
    } catch (cause) {
      if (aborted(options.signal) || isAbortFailure(cause)) {
        return abortResult(diagnostics, graph);
      }
      const message = failureMessage(cause, "Unknown adapter failure.");
      diagnostics.push(
        error(
          "adapter.compile.failed",
          `${adapter.manifest.id} failed: ${message}`,
          adapter.manifest.id,
        ),
      );
      continue;
    }
    if (aborted(options.signal)) {
      return abortResult(diagnostics, graph);
    }
    const outputBoundary = validateDataBoundary(output, ["output"]);
    if (outputBoundary.length > 0) {
      diagnostics.push(
        error(
          "adapter.output.invalid",
          `Adapter output must be inert, safely inspectable data (${outputBoundary[0]?.code ?? "boundary.invalid"}).`,
          adapter.manifest.id,
        ),
      );
      continue;
    }
    let outputSnapshot: unknown;
    try {
      outputSnapshot = snapshotDataBoundary(output);
      if (validateDataBoundary(outputSnapshot, ["output"]).length > 0) {
        throw new TypeError("Adapter output snapshot is not inert data.");
      }
    } catch {
      diagnostics.push(
        error(
          "adapter.output.invalid",
          "Adapter output could not be safely snapshotted.",
          adapter.manifest.id,
        ),
      );
      continue;
    }
    if (
      outputSnapshot === null ||
      typeof outputSnapshot !== "object" ||
      Array.isArray(outputSnapshot) ||
      !Array.isArray(
        (outputSnapshot as { readonly artifacts?: unknown }).artifacts,
      )
    ) {
      diagnostics.push(
        error(
          "adapter.output.invalid",
          "Adapter output must be an object containing an artifacts array.",
          adapter.manifest.id,
        ),
      );
      continue;
    }
    const adapterOutput = outputSnapshot as {
      artifacts: readonly unknown[];
      diagnostics?: readonly unknown[];
      preview?: unknown;
    };
    if (adapterOutput.diagnostics !== undefined) {
      if (!Array.isArray(adapterOutput.diagnostics)) {
        diagnostics.push(
          error(
            "adapter.diagnostics.invalid",
            "Adapter diagnostics must be an array.",
            adapter.manifest.id,
          ),
        );
      } else {
        for (const candidate of adapterOutput.diagnostics) {
          const normalized = validateDiagnostic(candidate, adapter.manifest.id);
          if (normalized === undefined) {
            diagnostics.push(
              error(
                "adapter.diagnostic.invalid",
                "Adapter returned an invalid diagnostic.",
                adapter.manifest.id,
              ),
            );
          } else {
            diagnostics.push(normalized);
          }
        }
      }
    }
    if (adapterOutput.preview !== undefined) {
      if (!adapter.manifest.capabilities.preview) {
        diagnostics.push(
          error(
            "adapter.preview.undeclared",
            "Adapter returned preview data without declaring support.",
            adapter.manifest.id,
          ),
        );
      } else if (!isJsonValue(adapterOutput.preview)) {
        diagnostics.push(
          error(
            "adapter.preview.invalid",
            "Adapter preview must be finite, acyclic JSON data.",
            adapter.manifest.id,
          ),
        );
      } else {
        previews[adapter.manifest.id] = snapshotJson(adapterOutput.preview);
      }
    }
    for (const candidate of adapterOutput.artifacts) {
      // One artifact slot is reserved for theme.lock.json.
      if (artifacts.length >= limits.maxArtifacts - 1) {
        diagnostics.push(
          error(
            "limit.artifacts.exceeded",
            `Compile exceeds the ${limits.maxArtifacts} artifact limit.`,
          ),
        );
        break;
      }
      const validated = validateArtifact(
        candidate,
        adapter.manifest.id,
        limits,
      );
      diagnostics.push(...validated.diagnostics);
      if (validated.artifact === undefined) continue;
      const collisionKey = validated.artifact.path
        .normalize("NFC")
        .toLocaleLowerCase("en-US");
      if (seenPaths.has(collisionKey)) {
        diagnostics.push(
          error(
            "artifact.path.duplicate",
            `Artifact path ${validated.artifact.path} collides with another output.`,
            adapter.manifest.id,
          ),
        );
        continue;
      }
      if (totalBytes + validated.bytes > limits.maxTotalArtifactBytes) {
        diagnostics.push(
          error(
            "limit.total-artifact-bytes.exceeded",
            `Compile exceeds the ${limits.maxTotalArtifactBytes} total artifact byte limit.`,
            adapter.manifest.id,
          ),
        );
        continue;
      }
      seenPaths.add(collisionKey);
      totalBytes += validated.bytes;
      artifacts.push({ ...validated.artifact, adapterId: adapter.manifest.id });
    }
  }

  artifacts.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  if (aborted(options.signal)) return abortResult(diagnostics, graph);
  if (hasErrors(diagnostics)) {
    return {
      ok: false,
      graph,
      diagnostics,
    };
  }

  let lockfile: CompiledArtifact;
  try {
    lockfile = await buildLockfile(projectSnapshot, validAdapters, artifacts);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unknown hashing failure.";
    diagnostics.push(error("lockfile.hash.failed", message));
    return {
      ok: false,
      graph,
      diagnostics,
    };
  }
  const lockfileBytes = new TextEncoder().encode(lockfile.content).byteLength;
  if (
    lockfileBytes > limits.maxArtifactBytes ||
    totalBytes + lockfileBytes > limits.maxTotalArtifactBytes
  ) {
    diagnostics.push(
      error(
        "limit.lockfile-bytes.exceeded",
        "theme.lock.json would exceed the configured artifact byte limits.",
      ),
    );
    return {
      ok: false,
      graph,
      diagnostics,
    };
  }
  const resultArtifacts = Object.freeze([...artifacts, lockfile]);
  return {
    ok: true,
    graph,
    artifacts: resultArtifacts,
    diagnostics,
    previews: Object.freeze(previews),
    lockfile,
  };
}
