import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import {
  createMuiAdapter,
  muiAdapterManifest,
  safeParseMuiAdapterPreview,
} from "./index.js";

const colors = {
  brand: color("#0066cc", [0, 0.4, 0.8]),
  accent: color("#8b5cf6", [0.545, 0.361, 0.965]),
  white: color("#ffffff", [1, 1, 1]),
  navy: color("#050a14", [0.02, 0.04, 0.08]),
  surface: color("#f5f7fa", [0.961, 0.969, 0.98]),
  darkSurface: color("#111827", [0.067, 0.094, 0.153]),
  muted: color("#667085", [0.4, 0.439, 0.522]),
  divider: color("#d0d5dd", [0.816, 0.835, 0.867]),
} as const;

function color(
  hex: string,
  components: readonly [number, number, number],
): ResolvedColor {
  return { colorSpace: "srgb", components, alpha: 1, hex };
}

function graph(): ThemeGraph {
  return {
    schemaVersion: "1.0",
    projectId: "acme",
    projectName: "Acme",
    primitives: Object.entries(colors).map(([id, value]) => ({
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
          foreground: role("foreground", "navy"),
          "muted-foreground": role("muted-foreground", "muted"),
          divider: role("divider", "divider"),
          "component-special": role("component-special", "accent"),
        },
      },
      {
        id: "dark",
        roles: {
          primary: role("primary", "accent"),
          "primary-foreground": role("primary-foreground", "navy"),
          background: role("background", "navy"),
          surface: role("surface", "darkSurface"),
          foreground: role("foreground", "white"),
        },
      },
    ],
  };
}

function role(roleName: string, ref: keyof typeof colors) {
  return { role: roleName, ref, value: colors[ref] };
}

describe("MUI adapter", () => {
  it("exposes its MUI v9 capability contract", () => {
    expect(muiAdapterManifest).toMatchObject({
      id: "mui@9",
      engineApiVersion: "1",
      maturity: "beta",
      target: { name: "@mui/material", version: ">=9 <10" },
      capabilities: {
        colors: { native: ["srgb", "hsl"], fallback: "srgb-hex" },
        schemes: { count: "multiple", ids: ["light", "dark"] },
        roles: { requirement: "required", required: ["primary"] },
        preview: true,
      },
      options: { exportName: { type: "string", default: "theme" } },
    });
  });

  it("emits deterministic createTheme colorSchemes from explicit standard roles only", async () => {
    const adapter = createMuiAdapter();
    const first = await adapter.compile(graph(), {});
    const source = graph();
    const reordered: ThemeGraph = {
      ...source,
      primitives: [...source.primitives].reverse(),
      schemes: [...source.schemes].reverse().map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(Object.entries(scheme.roles).reverse()),
      })),
    };
    const second = await adapter.compile(reordered, {});
    const expectedOptions = {
      cssVariables: { colorSchemeSelector: "data" },
      colorSchemes: {
        light: {
          palette: {
            primary: { main: "#0066cc", contrastText: "#ffffff" },
            secondary: { main: "#8b5cf6" },
            background: { default: "#ffffff", paper: "#f5f7fa" },
            text: { primary: "#050a14", secondary: "#667085" },
            divider: "#d0d5dd",
          },
        },
        dark: {
          palette: {
            primary: { main: "#8b5cf6", contrastText: "#050a14" },
            background: { default: "#050a14", paper: "#111827" },
            text: { primary: "#ffffff" },
          },
        },
      },
    };
    const expectedSource = [
      'import { createTheme } from "@mui/material/styles";',
      "",
      `export const theme = createTheme(${JSON.stringify(expectedOptions, null, 2)});`,
      "",
      "export default theme;",
      "",
    ].join("\n");

    expect(first.artifacts).toEqual(second.artifacts);
    expect(first.artifacts).toEqual([
      {
        path: "theme.ts",
        mediaType: "text/typescript",
        content: expectedSource,
      },
    ]);
    expect(first.preview).toEqual({
      kind: "mui-theme-options",
      targetVersion: "9",
      themeOptions: expectedOptions,
    });
    expect(first.diagnostics?.map((diagnostic) => diagnostic.code)).toContain(
      "mui.unsupported-role",
    );
    expect(expectedSource).not.toContain("component-special");
  });

  it("uses a declared sRGB fallback for unsupported color spaces", async () => {
    const vivid: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.72, 0.28, 12],
      alpha: 0.5,
      hex: "#ff3366",
    };
    const source = graph();
    const fallbackGraph: ThemeGraph = {
      ...source,
      primitives: [{ id: "vivid", $type: "color", value: vivid }],
      schemes: [
        {
          id: "light",
          roles: { primary: { role: "primary", ref: "vivid", value: vivid } },
        },
      ],
    };
    const result = await compileTheme(project(fallbackGraph), [
      createMuiAdapter(),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("Expected fallback compilation to succeed.");
    expect(result.artifacts[0]?.content).toContain(
      '"main": "rgba(255, 51, 102, 0.5)"',
    );
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toContain(
      "mui.color-fallback.used",
    );
  });

  it("preserves native HSL even when a hexadecimal fallback is present", async () => {
    const hsl: ResolvedColor = {
      colorSpace: "hsl",
      components: [210, 80, 45],
      alpha: 0.75,
      hex: "#176bcf",
    };
    const source = graph();
    const hslGraph: ThemeGraph = {
      ...source,
      primitives: [{ id: "brand", $type: "color", value: hsl }],
      schemes: [
        {
          id: "light",
          roles: { primary: { role: "primary", ref: "brand", value: hsl } },
        },
      ],
    };

    const result = await createMuiAdapter().compile(hslGraph, {});

    expect(result.artifacts[0]?.content).toContain(
      '"main": "hsla(210, 80%, 45%, 0.75)"',
    );
    expect(
      result.diagnostics?.map((diagnostic) => diagnostic.code),
    ).not.toContain("mui.color-fallback.used");
  });

  it("skips unsupported colors and foreground overrides without a main color", async () => {
    const unsupported: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.7, 0.2, 40],
      alpha: 1,
    };
    const source = graph();
    const incomplete: ThemeGraph = {
      ...source,
      primitives: [
        { id: "unsupported", $type: "color", value: unsupported },
        { id: "white", $type: "color", value: colors.white },
      ],
      schemes: [
        {
          id: "light",
          roles: {
            primary: {
              role: "primary",
              ref: "unsupported",
              value: unsupported,
            },
            "secondary-foreground": {
              role: "secondary-foreground",
              ref: "white",
              value: colors.white,
            },
            "primary-foreground": {
              role: "primary-foreground",
              ref: "white",
              value: colors.white,
            },
          },
        },
      ],
    };
    const result = await createMuiAdapter().compile(incomplete, {});

    expect(result.artifacts[0]?.content).toContain('"light": true');
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "mui.unsupported-color-space",
        "mui.contrast-without-main",
      ]),
    );
    expect(result.artifacts[0]?.content).not.toContain("contrastText");

    const compiled = await compileTheme(project(incomplete), [
      createMuiAdapter(),
    ]);
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "adapter.color-space.unsupported",
      }),
    );
  });

  it("normalizes a hostile TypeScript export name without injecting source", async () => {
    const result = await createMuiAdapter({
      exportName: "theme; globalThis.pwned = true; const x",
    }).compile(graph(), {});
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain(
      "export const theme_globalThis_pwned_true_const_x = createTheme(",
    );
    expect(content).not.toContain("globalThis.pwned = true");
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toContain(
      "mui.export-name.normalized",
    );
  });

  it("fails closed for schemes that require MUI module augmentation", async () => {
    const source = graph();
    const highContrast: ThemeGraph = {
      ...source,
      schemes: [{ ...source.schemes[0]!, id: "high-contrast" }],
    };
    const result = await createMuiAdapter().compile(highContrast, {});

    expect(result.artifacts[0]?.content).toContain(
      'createTheme({\n  "cssVariables": {\n    "colorSchemeSelector": "data"\n  }\n})',
    );
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "mui.unsupported-scheme",
        "mui.no-supported-schemes",
      ]),
    );

    const compiled = await compileTheme(project(highContrast), [
      createMuiAdapter(),
    ]);
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "adapter.scheme-id.unsupported",
      }),
    );
  });

  it("runs through compileTheme with the exact target model used by preview", async () => {
    const result = await compileTheme(project(), [createMuiAdapter()]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected MUI compilation to succeed.");
    expect(result.previews["mui@9"]).toMatchObject({
      kind: "mui-theme-options",
      themeOptions: {
        cssVariables: { colorSchemeSelector: "data" },
        colorSchemes: {},
      },
    });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "theme.ts", adapterId: "mui@9" }),
      ]),
    );
    expect(
      result.diagnostics.map((diagnostic) => diagnostic.code),
    ).not.toContain("adapter.diagnostic.invalid");
  });

  it("snapshots normalized options at factory creation", async () => {
    const options = { exportName: "Product Theme" };
    const adapter = createMuiAdapter(options);
    options.exportName = "changed";

    expect(adapter.configuration).toEqual({ exportName: "Product_Theme" });
    const result = await adapter.compile(graph(), {});
    expect(result.artifacts[0]?.content).toContain(
      "export const Product_Theme = createTheme(",
    );
  });

  it("parses partial palettes and contains hostile unknown inputs", () => {
    expect(
      safeParseMuiAdapterPreview({
        kind: "mui-theme-options",
        targetVersion: "9",
        themeOptions: {
          cssVariables: { colorSchemeSelector: "data" },
          colorSchemes: {
            light: { palette: { primary: { main: "#0066cc" } } },
          },
        },
      }).success,
    ).toBe(true);

    let reads = 0;
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "kind", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "mui-theme-options";
      },
    });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(safeParseMuiAdapterPreview(accessor).success).toBe(false);
    expect(reads).toBe(0);
    expect(() => safeParseMuiAdapterPreview(proxy)).not.toThrow();
    expect(safeParseMuiAdapterPreview(proxy).success).toBe(false);
  });
});

function project(source: ThemeGraph = graph()): ThemeProject {
  return {
    schemaVersion: source.schemaVersion,
    id: source.projectId,
    ...(source.projectName === undefined ? {} : { name: source.projectName }),
    primitives: source.primitives.map((primitive) => ({
      ...primitive,
      id: namespacedPrimitiveId(primitive.id),
    })),
    schemes: source.schemes.map((scheme) => ({
      id: scheme.id,
      roles: Object.fromEntries(
        Object.values(scheme.roles).map((resolvedRole) => [
          resolvedRole.role,
          { ref: namespacedPrimitiveId(resolvedRole.ref) },
        ]),
      ),
    })),
  };
}

function namespacedPrimitiveId(value: string): string {
  return value.startsWith("palette.") ? value : `palette.${value}`;
}
