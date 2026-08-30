import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import { createVuetifyAdapter, vuetifyAdapterManifest } from "./index.js";

const palette = {
  brand: color("#0066cc", [0, 0.4, 0.8]),
  accent: color("#8b5cf6", [0.545, 0.361, 0.965]),
  white: color("#ffffff", [1, 1, 1]),
  ink: color("#050a14", [0.02, 0.04, 0.08]),
  surface: color("#f5f7fa", [0.961, 0.969, 0.98]),
  border: color("#d0d5dd", [0.816, 0.835, 0.867]),
} as const;

describe("Vuetify adapter", () => {
  it("publishes the v4 capability contract", () => {
    expect(vuetifyAdapterManifest).toMatchObject({
      id: "vuetify@4",
      adapterVersion: "0.6.0",
      target: { name: "vuetify", version: ">=4 <5" },
      capabilities: {
        schemes: { ids: ["light", "dark"] },
        roles: { required: ["primary"] },
      },
    });
  });

  it("emits deterministic exact ThemeDefinition modules", async () => {
    const source = graph();
    const reordered: ThemeGraph = {
      ...source,
      primitives: [...source.primitives].reverse(),
      schemes: [...source.schemes].reverse().map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(Object.entries(scheme.roles).reverse()),
      })),
    };
    const first = await createVuetifyAdapter().compile(source, {});
    const second = await createVuetifyAdapter().compile(reordered, {});
    expect(first.artifacts).toEqual(second.artifacts);
    const content = first.artifacts[0]?.content ?? "";
    expect(content).toContain(
      'import type { ThemeDefinition, VuetifyOptions } from "vuetify";',
    );
    expect(content).toContain("export const lightTheme: ThemeDefinition");
    expect(content).toContain('"on-background": "#050a14"');
    expect(content).toContain('"on-surface": "#050a14"');
    expect(content).toContain('"border-color": "#d0d5dd"');
    expect(content).toContain('"border-opacity": 1');
    expect(content).toContain('defaultTheme: "system"');
    expect(content.indexOf('"light": lightTheme')).toBeLessThan(
      content.indexOf('"dark": darkTheme'),
    );
    expect(content).not.toContain("unsafe-role");
    expect(first.diagnostics?.map(({ code }) => code)).toContain(
      "vuetify.unsupported-role",
    );
  });

  it("contains hostile export names and unsupported target input", async () => {
    const source = graph();
    const hostile: ThemeGraph = {
      ...source,
      schemes: [{ ...source.schemes[0]!, id: "light;body{}" }],
    };
    const result = await createVuetifyAdapter({
      exportName: "x; globalThis.pwned = true",
    }).compile(hostile, {});
    const content = result.artifacts[0]?.content ?? "";
    expect(content).toContain("export const x_globalThis_pwned_true");
    expect(content).not.toContain("globalThis.pwned = true");
    expect(result.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "vuetify.export-name.normalized",
        "vuetify.unsupported-scheme",
      ]),
    );
  });

  it.each([
    "eval",
    "arguments",
    "ThemeDefinition",
    "VuetifyOptions",
    "lightTheme",
    "darkTheme",
  ])("normalizes reserved export name %s", async (exportName) => {
    const result = await createVuetifyAdapter({ exportName }).compile(
      graph(),
      {},
    );
    expect(result.artifacts[0]?.content).toContain(
      `export const _${exportName} = {`,
    );
    expect(result.diagnostics?.map(({ code }) => code)).toContain(
      "vuetify.export-name.normalized",
    );
  });

  it("uses declared fallbacks and fails compileTheme closed without one", async () => {
    const fallback: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.7, 0.2, 30],
      alpha: 1,
      hex: "#ff3366",
    };
    const source = singleColorGraph(fallback);
    const direct = await createVuetifyAdapter().compile(source, {});
    expect(direct.artifacts[0]?.content).toContain('"primary": "#ff3366"');
    expect(direct.diagnostics?.map(({ code }) => code)).toContain(
      "vuetify.color-fallback.used",
    );

    const unsupported = singleColorGraph({
      colorSpace: fallback.colorSpace,
      components: fallback.components,
      alpha: fallback.alpha,
    });
    const compiled = await compileTheme(project(unsupported), [
      createVuetifyAdapter(),
    ]);
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({ code: "adapter.color-space.unsupported" }),
    );

    const translucent = await compileTheme(
      project(
        singleColorGraph({
          colorSpace: "srgb",
          components: [1, 0.2, 0.4],
          alpha: 0.5,
          hex: "#ff3366",
        }),
      ),
      [createVuetifyAdapter()],
    );
    expect(translucent.ok).toBe(false);
    expect(translucent.diagnostics).toContainEqual(
      expect.objectContaining({ code: "vuetify.alpha.unsupported" }),
    );
  });

  it("serializes divider as Vuetify RGB channels plus explicit opacity", async () => {
    const source = graph();
    const light = source.schemes[0]!;
    const translucentHsl: ResolvedColor = {
      colorSpace: "hsl",
      components: [0, 100, 50],
      alpha: 0.4,
    };
    const result = await createVuetifyAdapter().compile(
      {
        ...source,
        schemes: [
          {
            ...light,
            roles: {
              ...light.roles,
              divider: {
                role: "divider",
                ref: "border",
                value: translucentHsl,
              },
            },
          },
        ],
      },
      {},
    );
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain('"border-color": "#ff0000"');
    expect(content).toContain('"border-opacity": 0.4');
    expect(content).not.toContain('"border-color": "hsl(');
  });

  it("runs through compileTheme and snapshots configuration", async () => {
    const options = { exportName: "Product Theme" };
    const adapter = createVuetifyAdapter(options);
    options.exportName = "changed";
    expect(adapter.configuration).toEqual({ exportName: "Product_Theme" });
    const result = await compileTheme(project(), [adapter]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Vuetify compilation to succeed");
    expect(result.artifacts).toContainEqual(
      expect.objectContaining({
        path: "vuetify.theme.ts",
        adapterId: "vuetify@4",
      }),
    );
    expect(result.previews["vuetify@4"]).toMatchObject({
      kind: "vuetify-theme-options",
      targetVersion: "4",
    });
  });
});

function graph(): ThemeGraph {
  return {
    schemaVersion: "1.0",
    projectId: "fixture",
    primitives: Object.entries(palette).map(([id, value]) => ({
      id,
      $type: "color",
      value,
    })),
    schemes: [
      {
        id: "light",
        roles: {
          primary: role("primary", "brand"),
          "primary-foreground": role("primary-foreground", "white"),
          secondary: role("secondary", "accent"),
          background: role("background", "white"),
          surface: role("surface", "surface"),
          foreground: role("foreground", "ink"),
          divider: role("divider", "border"),
          "unsafe-role": role("unsafe-role", "accent"),
        },
      },
      {
        id: "dark",
        roles: {
          primary: role("primary", "accent"),
          background: role("background", "ink"),
          foreground: role("foreground", "white"),
        },
      },
    ],
  };
}

function singleColorGraph(value: ResolvedColor): ThemeGraph {
  return {
    schemaVersion: "1.0",
    projectId: "single",
    primitives: [{ id: "brand", $type: "color", value }],
    schemes: [
      {
        id: "light",
        roles: { primary: { role: "primary", ref: "brand", value } },
      },
    ],
  };
}

function color(
  hex: string,
  components: readonly [number, number, number],
): ResolvedColor {
  return { colorSpace: "srgb", components, alpha: 1, hex };
}

function role(name: string, ref: keyof typeof palette) {
  return { role: name, ref, value: palette[ref] };
}

function project(source: ThemeGraph = graph()): ThemeProject {
  return {
    schemaVersion: source.schemaVersion,
    id: source.projectId,
    primitives: source.primitives.map((primitive) => ({
      ...primitive,
      id: `palette.${primitive.id}`,
    })),
    schemes: source.schemes.map((scheme) => ({
      id: scheme.id,
      roles: Object.fromEntries(
        Object.values(scheme.roles).map((resolved) => [
          resolved.role,
          { ref: `palette.${resolved.ref}` },
        ]),
      ),
    })),
  };
}
