import { describe, expect, it } from "vitest";

import {
  compileTheme,
  createThemeProject,
  isSafeArtifactPath,
  parseHexColor,
  safeParseJsonValue,
  sha256,
  stableStringify,
  type ColorComponent,
  type ColorSpace,
  type ThemeAdapter,
  type ThemeProject,
  type ThemeScheme,
} from "./index";

const schemes: readonly ThemeScheme[] = [
  {
    id: "light",
    roles: {
      primary: { ref: "palette.brand" },
      background: { ref: "palette.canvas" },
    },
  },
];

function project(): ThemeProject {
  return createThemeProject(
    { brand: "#663399", canvas: "#fff" },
    { id: "acme", name: "Acme", schemes },
  );
}

function adapter(
  overrides: Partial<ThemeAdapter> = {},
  id = "test@1",
): ThemeAdapter {
  return {
    manifest: {
      id,
      name: "Test adapter",
      engineApiVersion: "1",
      adapterVersion: "1.2.3",
      maturity: "beta",
      target: { name: "test-target", version: "1.x" },
      capabilities: {
        colors: { native: "passthrough", fallback: "none" },
        schemes: { count: "multiple", ids: "any" },
        roles: { requirement: "optional", supported: "any", required: [] },
        preview: true,
      },
      options: {},
    },
    compile: (graph) => ({
      artifacts: [
        {
          path: "theme.css",
          mediaType: "text/css; charset=utf-8",
          content: `:root { --primary: ${graph.schemes[0]?.roles.primary?.value.hex ?? "none"}; }\n`,
        },
      ],
      preview: { primary: graph.schemes[0]?.roles.primary?.value.hex ?? null },
    }),
    ...overrides,
  };
}

describe("parseHexColor", () => {
  it.each([
    ["#fff", "#ffffff", 1],
    ["#0f08", "#00ff00", 136 / 255],
    ["#663399", "#663399", 1],
    ["#663399CC", "#663399", 204 / 255],
  ])("strictly parses %s", (input, normalized, alpha) => {
    const color = parseHexColor(input);
    expect(color.colorSpace).toBe("srgb");
    expect(color.components).toHaveLength(3);
    expect(color.hex).toBe(normalized);
    expect(color.alpha).toBeCloseTo(alpha);
  });

  it.each([
    "red",
    "fff",
    " #fff",
    "#ff",
    "#fffff",
    "#ggg",
    "rgb(1 2 3)",
    "#fff\n",
  ])("rejects unsupported syntax %j", (input) =>
    expect(() => parseHexColor(input)).toThrow(/Expected #RGB/),
  );
});

describe("createThemeProject", () => {
  it("creates stable ids and does not infer semantic roles", () => {
    const result = createThemeProject(["#123", "#abcdef"], { id: "sample" });
    expect(result.primitives.map(({ id }) => id)).toEqual([
      "palette.color-1",
      "palette.color-2",
    ]);
    expect(result.schemes).toEqual([]);
  });

  it("creates stable named ids and preserves structured colors", () => {
    const result = createThemeProject({
      "Brand Blue": {
        colorSpace: "display-p3",
        components: [0.1, 0.2, 0.9],
        alpha: 0.8,
      },
    });
    expect(result.primitives[0]).toMatchObject({
      id: "palette.brand-blue",
      value: {
        colorSpace: "display-p3",
        components: [0.1, 0.2, 0.9],
        alpha: 0.8,
      },
    });
  });

  it("rejects normalized-name collisions and unsupported strings", () => {
    expect(() =>
      createThemeProject({ "Brand Blue": "#fff", "brand-blue": "#000" }),
    ).toThrow(/collide/);
    expect(() => createThemeProject(["oklch(50% 0.2 20)"])).toThrow(
      /Unsupported color/,
    );
  });
});

describe("compileTheme", () => {
  it("resolves explicit references and emits deterministic hashed artifacts", async () => {
    const first = await compileTheme(project(), [adapter()]);
    const second = await compileTheme(project(), [adapter()]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok)
      throw new Error("Expected deterministic fixture compilation to succeed.");
    expect(first.graph.schemes[0]?.roles.primary).toMatchObject({
      role: "primary",
      ref: "palette.brand",
      value: { hex: "#663399", alpha: 1 },
    });
    expect(first.previews["test@1"]).toEqual({ primary: "#663399" });
    expect(first.artifacts.map(({ path }) => path)).toEqual([
      "theme.css",
      "theme.lock.json",
    ]);
    expect(first.lockfile.content).toBe(second.lockfile.content);

    const lock = JSON.parse(first.lockfile.content) as {
      artifacts: { path: string; sha256: string }[];
    };
    const css = first.artifacts.find(({ path }) => path === "theme.css");
    expect(lock.artifacts).toEqual([
      expect.objectContaining({
        path: "theme.css",
        sha256: await sha256(css?.content ?? ""),
      }),
    ]);
  });

  it("returns diagnostics rather than calling adapters for an invalid project", async () => {
    let called = false;
    const invalid = {
      ...project(),
      schemes: [
        { id: "light", roles: { primary: { ref: "palette.missing" } } },
      ],
    } as ThemeProject;
    const result = await compileTheme(invalid, [
      adapter({
        compile: () => {
          called = true;
          return { artifacts: [] };
        },
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "project.reference.unresolved",
        severity: "error",
      }),
    );
  });

  it.each<
    [ColorSpace, readonly [ColorComponent, ColorComponent, ColorComponent]]
  >([
    ["srgb", [1.01, 0, 0]],
    ["srgb-linear", [-0.01, 0, 0]],
    ["hsl", [360, 50, 50]],
    ["hwb", [0, 101, 0]],
    ["lab", [101, 10_000, -10_000]],
    ["lch", [50, -0.01, 20]],
    ["oklab", [1.01, 10_000, -10_000]],
    ["oklch", [0.5, 0.2, 360]],
    ["display-p3", [0, 0, 1.01]],
    ["a98-rgb", [0, -0.01, 0]],
    ["prophoto-rgb", [2, 0, 0]],
    ["rec2020", [0, 2, 0]],
    ["xyz-d50", [0, 0, -0.01]],
    ["xyz-d65", [0, 0, 1.01]],
  ])(
    "enforces DTCG component ranges for %s",
    async (colorSpace, components) => {
      const invalid: ThemeProject = {
        schemaVersion: "1.0",
        id: "ranges",
        primitives: [
          {
            id: "palette.test",
            $type: "color",
            value: { colorSpace, components },
          },
        ],
        schemes: [],
      };
      const result = await compileTheme(invalid, []);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "project.component.out-of-range" }),
      );
    },
  );

  it("allows DTCG none and unbounded chromatic axes", async () => {
    const valid: ThemeProject = {
      schemaVersion: "1.0",
      id: "unbounded",
      primitives: [
        {
          id: "palette.lab",
          $type: "color",
          value: { colorSpace: "lab", components: [50, 10_000, -10_000] },
        },
        {
          id: "palette.lch",
          $type: "color",
          value: { colorSpace: "lch", components: [50, 10_000, "none"] },
        },
      ],
      schemes: [],
    };
    expect((await compileTheme(valid, [])).ok).toBe(true);
  });

  it("rejects an alpha-bearing DTCG hex fallback", async () => {
    const invalid: ThemeProject = {
      schemaVersion: "1.0",
      id: "hex-alpha",
      primitives: [
        {
          id: "palette.test",
          $type: "color",
          value: {
            colorSpace: "srgb",
            components: [0, 0, 0],
            alpha: 0.5,
            hex: "#00000080",
          },
        },
      ],
      schemes: [],
    };
    const result = await compileTheme(invalid, []);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "project.hex.invalid" }),
    );
  });

  it("keeps alpha separate from a valid six-digit DTCG hex fallback", async () => {
    const translucent = createThemeProject(["#00000080"]);
    const result = await compileTheme(translucent, []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected translucent color to compile.");
    expect(result.graph.primitives[0]?.value).toMatchObject({
      hex: "#000000",
      alpha: 128 / 255,
    });
  });

  it("enforces required roles and color-space capabilities before adapter execution", async () => {
    let called = false;
    const strict = adapter({
      manifest: {
        ...adapter().manifest,
        capabilities: {
          colors: { native: ["display-p3"], fallback: "none" },
          schemes: { count: "multiple", ids: "any" },
          roles: {
            requirement: "required",
            supported: "any",
            required: ["error"],
          },
          preview: true,
        },
      },
      compile: () => {
        called = true;
        return { artifacts: [] };
      },
    });
    const result = await compileTheme(project(), [strict]);
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "adapter.role.required",
        "adapter.color-space.unsupported",
      ]),
    );
  });

  it.each([
    "../secret",
    "/absolute.css",
    "C:/theme.css",
    "a\\b.css",
    "theme.lock.json",
    "CON",
  ])("rejects unsafe or reserved artifact path %s", async (path) => {
    const result = await compileTheme(project(), [
      adapter({
        compile: () => ({
          artifacts: [{ path, mediaType: "text/css", content: "x" }],
        }),
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("lockfile");
    expect(result).not.toHaveProperty("artifacts");
    expect(result).not.toHaveProperty("previews");
    expect(
      result.diagnostics.some(({ code }) => code.startsWith("artifact.path.")),
    ).toBe(true);
  });

  it("detects cross-adapter path collisions case-insensitively", async () => {
    const first = adapter({
      compile: () => ({
        artifacts: [{ path: "Theme.css", mediaType: "text/css", content: "a" }],
      }),
    });
    const second = adapter(
      {
        compile: () => ({
          artifacts: [
            { path: "theme.css", mediaType: "text/css", content: "b" },
          ],
        }),
      },
      "other@1",
    );
    const result = await compileTheme(project(), [first, second]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "artifact.path.duplicate" }),
    );
  });

  it("bounds adapter output and reports thrown adapter errors", async () => {
    const tooLarge = await compileTheme(project(), [adapter()], {
      limits: { maxArtifactBytes: 8, maxTotalArtifactBytes: 1_000_000 },
    });
    expect(tooLarge.ok).toBe(false);
    expect(tooLarge.diagnostics).toContainEqual(
      expect.objectContaining({ code: "limit.artifact-bytes.exceeded" }),
    );

    const thrown = await compileTheme(project(), [
      adapter({ compile: () => Promise.reject(new Error("boom")) }),
    ]);
    expect(thrown.ok).toBe(false);
    const failure = thrown.diagnostics.find(
      ({ code }) => code === "adapter.compile.failed",
    );
    expect(failure?.message).toContain("boom");
  });

  it("does not expose validated outputs when an adapter reports an error", async () => {
    const result = await compileTheme(project(), [
      adapter({
        compile: () => ({
          artifacts: [
            { path: "theme.css", mediaType: "text/css", content: ":root {}" },
          ],
          preview: { primary: "#663399" },
          diagnostics: [
            {
              severity: "error",
              code: "test.generation.failed",
              message: "Generation failed after producing partial output.",
            },
          ],
        }),
      }),
    ]);

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("artifacts");
    expect(result).not.toHaveProperty("previews");
    expect(result).not.toHaveProperty("lockfile");
  });

  it("honors an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await compileTheme(project(), [adapter()], {
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "compile.aborted" }),
    );
  });

  it("reports a mid-adapter abort as compile.aborted only", async () => {
    const controller = new AbortController();
    const result = await compileTheme(
      project(),
      [
        adapter({
          compile: (_graph, context) => {
            controller.abort();
            context.signal?.throwIfAborted();
            return { artifacts: [] };
          },
        }),
      ],
      { signal: controller.signal },
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "compile.aborted",
    ]);
    expect(result).not.toHaveProperty("lockfile");
    expect(result).not.toHaveProperty("artifacts");
    expect(result).not.toHaveProperty("previews");
  });

  it("snapshots mutable project, manifest, and preview inputs", async () => {
    const mutableProject = project() as {
      -readonly [Key in keyof ThemeProject]: ThemeProject[Key];
    };
    const preview = { nested: { value: "original" } };
    const mutableAdapter = adapter({
      compile: () => {
        mutableProject.name = "Changed during compile";
        (mutableAdapter.manifest as { adapterVersion: string }).adapterVersion =
          "999.0.0";
        return { artifacts: [], preview };
      },
    });
    const result = await compileTheme(mutableProject, [mutableAdapter]);
    preview.nested.value = "changed after compile";

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("Expected snapshot compilation to succeed.");
    expect(result.graph.projectName).toBe("Acme");
    expect(result.previews["test@1"]).toEqual({
      nested: { value: "original" },
    });
    expect(Object.isFrozen(result.previews["test@1"])).toBe(true);
    const lock = JSON.parse(result.lockfile.content) as unknown as {
      adapters: { adapterVersion: string }[];
    };
    expect(lock.adapters[0]?.adapterVersion).toBe("1.2.3");
  });

  it("operates only on descriptor snapshots after project and adapter validation", async () => {
    let projectPropertyReads = 0;
    let adapterPropertyReads = 0;
    const projectProxy = new Proxy(project(), {
      get: () => {
        projectPropertyReads += 1;
        throw new Error("project property read");
      },
    });
    const adapterProxy = new Proxy(adapter(), {
      get: () => {
        adapterPropertyReads += 1;
        throw new Error("adapter property read");
      },
    });

    const result = await compileTheme(projectProxy, [adapterProxy]);
    expect(result.ok).toBe(true);
    expect(projectPropertyReads).toBe(0);
    expect(adapterPropertyReads).toBe(0);

    let ownKeyReads = 0;
    const changingProject = new Proxy(project(), {
      ownKeys: (target) => {
        ownKeyReads += 1;
        if (ownKeyReads > 1) throw new Error("project shape changed");
        return Reflect.ownKeys(target);
      },
    });
    await expect(compileTheme(changingProject, [])).resolves.toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "boundary.snapshot.failed" }),
      ],
    });
  });

  it("rejects accessor-backed project data without invoking getters", async () => {
    let componentReads = 0;
    let refReads = 0;
    const components: number[] = [0, 0, 0];
    Object.defineProperty(components, "0", {
      enumerable: true,
      get: () => {
        componentReads += 1;
        return 0.4;
      },
    });
    const reference = Object.create(null) as { ref: string };
    Object.defineProperty(reference, "ref", {
      enumerable: true,
      get: () => {
        refReads += 1;
        return "palette.brand";
      },
    });
    const hostile = {
      ...project(),
      primitives: [
        {
          id: "palette.brand",
          $type: "color",
          value: { colorSpace: "srgb", components },
        },
      ],
      schemes: [{ id: "light", roles: { primary: reference } }],
    } as unknown as ThemeProject;
    const result = await compileTheme(hostile, [adapter()]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "boundary.accessor.unsupported" }),
    );
    expect(componentReads).toBe(0);
    expect(refReads).toBe(0);
  });

  it("rejects deeply nested project and adapter data without overflowing the stack", async () => {
    const deeplyNested = (): Record<string, unknown> => {
      let value: Record<string, unknown> = {};
      for (let depth = 0; depth < 20_000; depth += 1) {
        value = { next: value };
      }
      return value;
    };

    const hostileProject = {
      ...project(),
      extra: deeplyNested(),
    } as ThemeProject;
    const projectResult = await compileTheme(hostileProject, []);
    expect(projectResult.ok).toBe(false);
    expect(projectResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: "boundary.depth.exceeded" }),
    );

    const outputResult = await compileTheme(project(), [
      adapter({
        compile: () => ({ artifacts: [], extra: deeplyNested() }) as never,
      }),
    ]);
    expect(outputResult.ok).toBe(false);
    const outputDiagnostic = outputResult.diagnostics.find(
      ({ code }) => code === "adapter.output.invalid",
    );
    expect(outputDiagnostic?.message).toContain("boundary.depth.exceeded");
  });

  it("rejects sparse project arrays before snapshot or resolution", async () => {
    const sparsePrimitives = new Array(
      1,
    ) as unknown as ThemeProject["primitives"];
    const sparseSchemes = new Array(1) as unknown as ThemeProject["schemes"];
    const sparseComponents = new Array(3) as unknown as [
      number,
      number,
      number,
    ];
    sparseComponents[0] = 0;
    sparseComponents[2] = 0;
    const base = project();
    const primitive = base.primitives[0];
    if (primitive === undefined)
      throw new Error("Fixture primitive is missing.");

    const cases: readonly [ThemeProject, readonly (string | number)[]][] = [
      [{ ...base, primitives: sparsePrimitives }, ["primitives"]],
      [{ ...base, schemes: sparseSchemes }, ["schemes"]],
      [
        {
          ...base,
          primitives: [
            {
              ...primitive,
              value: { colorSpace: "srgb", components: sparseComponents },
            },
          ],
          schemes: [],
        },
        ["primitives", 0, "value", "components"],
      ],
    ];

    for (const [candidate, path] of cases) {
      const result = await compileTheme(candidate, []);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "boundary.array.sparse", path }),
      );
    }
  });

  it("rejects sparse adapter and manifest arrays", async () => {
    const sparseAdapters = new Array(1) as unknown as readonly ThemeAdapter[];
    const sparseRoles = new Array(1) as unknown as readonly string[];
    const sparseColorSpaces = new Array(1) as unknown as readonly ColorSpace[];
    const manifestCases = [
      adapter({
        manifest: {
          ...adapter().manifest,
          capabilities: {
            ...adapter().manifest.capabilities,
            roles: {
              ...adapter().manifest.capabilities.roles,
              required: sparseRoles,
            },
          },
        },
      }),
      adapter({
        manifest: {
          ...adapter().manifest,
          capabilities: {
            ...adapter().manifest.capabilities,
            colors: {
              ...adapter().manifest.capabilities.colors,
              native: sparseColorSpaces,
            },
          },
        },
      }),
    ];

    for (const candidates of [
      sparseAdapters,
      ...manifestCases.map((entry) => [entry]),
    ]) {
      const result = await compileTheme(project(), candidates);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "boundary.array.sparse" }),
      );
    }
  });

  it("maps sparse adapter output arrays to adapter.output.invalid", async () => {
    const cases: readonly unknown[] = [
      { artifacts: new Array(1) },
      { artifacts: [], diagnostics: new Array(1) },
      { artifacts: [], preview: { swatches: new Array(1) } },
      {
        artifacts: [],
        diagnostics: [
          {
            severity: "warning",
            code: "test.warning",
            message: "warning",
            path: new Array(1),
          },
        ],
      },
    ];

    for (const output of cases) {
      const result = await compileTheme(project(), [
        adapter({ compile: () => output as never }),
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "adapter.output.invalid",
      ]);
    }
  });

  it("rejects accessor-backed adapter output without invoking getters", async () => {
    const cases: readonly (() => {
      readonly output: unknown;
      readonly reads: () => number;
    })[] = [
      () => {
        let reads = 0;
        const output: Record<string, unknown> = {};
        Object.defineProperty(output, "artifacts", {
          enumerable: true,
          get: () => {
            reads += 1;
            throw new Error("artifacts getter invoked");
          },
        });
        return { output, reads: () => reads };
      },
      () => {
        let reads = 0;
        const artifact: Record<string, unknown> = {
          mediaType: "text/css",
          content: "x",
        };
        Object.defineProperty(artifact, "path", {
          enumerable: true,
          get: () => {
            reads += 1;
            throw new Error("artifact getter invoked");
          },
        });
        return { output: { artifacts: [artifact] }, reads: () => reads };
      },
      () => {
        let reads = 0;
        const entry: Record<string, unknown> = {
          severity: "warning",
          code: "test.warning",
        };
        Object.defineProperty(entry, "message", {
          enumerable: true,
          get: () => {
            reads += 1;
            throw new Error("diagnostic getter invoked");
          },
        });
        return {
          output: { artifacts: [], diagnostics: [entry] },
          reads: () => reads,
        };
      },
      () => {
        let reads = 0;
        const preview: Record<string, unknown> = {};
        Object.defineProperty(preview, "primary", {
          enumerable: true,
          get: () => {
            reads += 1;
            throw new Error("preview getter invoked");
          },
        });
        return { output: { artifacts: [], preview }, reads: () => reads };
      },
    ];

    for (const createCase of cases) {
      const { output, reads } = createCase();
      const result = await compileTheme(project(), [
        adapter({ compile: () => output as never }),
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "adapter.output.invalid",
      ]);
      expect(reads()).toBe(0);
    }
  });

  it("contains throwing output proxies and thrown error proxies", async () => {
    let ownKeyReads = 0;
    const changingOutput = new Proxy(
      { artifacts: [] },
      {
        ownKeys: (target) => {
          ownKeyReads += 1;
          if (ownKeyReads > 1) throw new Error("shape changed");
          return Reflect.ownKeys(target);
        },
      },
    );
    const invalidOutput = await compileTheme(project(), [
      adapter({ compile: () => changingOutput }),
    ]);
    expect(invalidOutput.ok).toBe(false);
    expect(invalidOutput.diagnostics.map(({ code }) => code)).toEqual([
      "adapter.output.invalid",
    ]);

    const hostileCause = new Proxy(new Error("hidden"), {
      get: () => {
        throw new Error("error property read");
      },
      getPrototypeOf: () => {
        throw new Error("error prototype read");
      },
      has: () => {
        throw new Error("error name check");
      },
    });
    const failedCompile = await compileTheme(project(), [
      adapter({ compile: () => Promise.reject(hostileCause) }),
    ]);
    expect(failedCompile.ok).toBe(false);
    expect(failedCompile.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "adapter.compile.failed",
        message: "test@1 failed: Unknown adapter failure.",
      }),
    );
  });

  it.each(["manifest", "compile"] as const)(
    "rejects an adapter %s getter without invoking it",
    async (property) => {
      let reads = 0;
      const source = adapter();
      const hostile: Record<string, unknown> = {};
      const other = property === "manifest" ? "compile" : "manifest";
      hostile[other] = source[other];
      Object.defineProperty(hostile, property, {
        enumerable: true,
        get: () => {
          reads += 1;
          return source[property];
        },
      });
      const result = await compileTheme(project(), [
        hostile as unknown as ThemeAdapter,
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "boundary.accessor.unsupported" }),
      );
      expect(reads).toBe(0);
    },
  );

  it("counts theme.lock.json against total byte limits", async () => {
    const result = await compileTheme(
      project(),
      [adapter({ compile: () => ({ artifacts: [] }) })],
      { limits: { maxArtifactBytes: 1_000_000, maxTotalArtifactBytes: 32 } },
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "limit.lockfile-bytes.exceeded" }),
    );
  });
});

describe("security helpers", () => {
  it("accepts only portable safe relative paths", () => {
    expect(isSafeArtifactPath("themes/light/theme.css", 240)).toBe(true);
    expect(isSafeArtifactPath("a//b", 240)).toBe(false);
    expect(isSafeArtifactPath("aux.json", 240)).toBe(false);
    expect(isSafeArtifactPath("theme.css.", 240)).toBe(false);
  });

  it("stableStringify sorts keys and rejects cycles", () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "z": 1\n}\n',
    );
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => stableStringify(cycle)).toThrow(/Circular/);
  });

  it("safely parses hostile unknown values without invoking accessors", () => {
    let reads = 0;
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "hidden";
      },
    });
    const target = {};
    const { proxy, revoke } = Proxy.revocable(target, {});
    revoke();

    expect(safeParseJsonValue(accessor).success).toBe(false);
    expect(reads).toBe(0);
    expect(() => safeParseJsonValue(proxy)).not.toThrow();
    expect(safeParseJsonValue(proxy).success).toBe(false);
  });
});
