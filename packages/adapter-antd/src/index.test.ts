import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import {
  antdAdapterManifest,
  createAntdAdapter,
  safeParseAntdAdapterPreview,
} from "./index.js";

const colors = {
  brand: color("#2563eb", [37 / 255, 99 / 255, 235 / 255]),
  white: color("#ffffff", [1, 1, 1]),
  paper: color("#f8fafc", [248 / 255, 250 / 255, 252 / 255]),
  ink: color("#07090f", [7 / 255, 9 / 255, 15 / 255]),
  night: color("#111827", [17 / 255, 24 / 255, 39 / 255]),
  muted: color("#64748b", [100 / 255, 116 / 255, 139 / 255]),
  divider: color("#dbe3ef", [219 / 255, 227 / 255, 239 / 255]),
} as const;

function color(
  hex: string,
  components: readonly [number, number, number],
): ResolvedColor {
  return { colorSpace: "srgb", components, alpha: 1, hex };
}

function role(roleName: string, ref: keyof typeof colors) {
  return { role: roleName, ref, value: colors[ref] };
}

function graph(): ThemeGraph {
  return {
    schemaVersion: "1.0",
    projectId: "fixture",
    projectName: "Fixture",
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
          background: role("background", "paper"),
          surface: role("surface", "white"),
          foreground: role("foreground", "ink"),
          "muted-foreground": role("muted-foreground", "muted"),
          divider: role("divider", "divider"),
        },
      },
      {
        id: "dark",
        roles: {
          primary: role("primary", "brand"),
          "primary-foreground": role("primary-foreground", "white"),
          background: role("background", "ink"),
          surface: role("surface", "night"),
          foreground: role("foreground", "white"),
          "muted-foreground": role("muted-foreground", "muted"),
          divider: role("divider", "divider"),
        },
      },
    ],
  };
}

describe("Ant Design adapter", () => {
  it("exposes its Ant Design v6 capability contract", () => {
    expect(antdAdapterManifest).toMatchObject({
      id: "antd@6",
      engineApiVersion: "1",
      adapterVersion: "0.6.0",
      maturity: "beta",
      target: { name: "antd", version: ">=6 <7" },
      capabilities: {
        colors: { native: ["srgb", "hsl"], fallback: "srgb-hex" },
        schemes: { count: "multiple", ids: ["light", "dark"] },
        preview: true,
      },
    });
  });

  it("emits deterministic typed light and dark ThemeConfig records", async () => {
    const source = graph();
    const reordered: ThemeGraph = {
      ...source,
      primitives: [...source.primitives].reverse(),
      schemes: [...source.schemes].reverse().map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(Object.entries(scheme.roles).reverse()),
      })),
    };
    const first = await createAntdAdapter().compile(source, {});
    const second = await createAntdAdapter().compile(reordered, {});
    const content = first.artifacts[0]?.content ?? "";

    expect(first.artifacts).toEqual(second.artifacts);
    expect(first.artifacts[0]).toMatchObject({
      path: "antd/theme.ts",
      mediaType: "text/typescript",
    });
    expect(content).toContain('import type { ThemeConfig } from "antd";');
    expect(content).toContain("algorithm: antdTheme.defaultAlgorithm");
    expect(content).toContain("algorithm: antdTheme.darkAlgorithm");
    expect(content).toContain('"colorPrimary": "#2563eb"');
    expect(content).toContain('"colorBgLayout": "#f8fafc"');
    expect(first.preview).toMatchObject({
      kind: "antd-theme-configs",
      targetVersion: "6",
      themes: {
        light: {
          algorithm: "default",
          token: {
            colorPrimary: "#2563eb",
            colorTextLightSolid: "#ffffff",
            colorBgLayout: "#f8fafc",
            colorBgContainer: "#ffffff",
            colorText: "#07090f",
            colorTextSecondary: "#64748b",
            colorBorder: "#dbe3ef",
          },
        },
        dark: { algorithm: "dark" },
      },
    });
  });

  it("uses an explicit sRGB fallback and preserves native HSL", async () => {
    const fallback: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.7, 0.2, 20],
      alpha: 0.5,
      hex: "#ff3366",
    };
    const hsl: ResolvedColor = {
      colorSpace: "hsl",
      components: [210, 80, 45],
      alpha: 0.75,
      hex: "#176bcf",
    };
    const source: ThemeGraph = {
      ...graph(),
      primitives: [
        { id: "fallback", $type: "color", value: fallback },
        { id: "hsl", $type: "color", value: hsl },
      ],
      schemes: [
        {
          id: "light",
          roles: {
            primary: { role: "primary", ref: "fallback", value: fallback },
            link: { role: "link", ref: "hsl", value: hsl },
          },
        },
      ],
    };
    const result = await createAntdAdapter().compile(source, {});
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain('"colorPrimary": "rgba(255, 51, 102, 0.5)"');
    expect(content).toContain('"colorLink": "hsla(210, 80%, 45%, 0.75)"');
    expect(result.diagnostics?.map(({ code }) => code)).toContain(
      "antd.color-fallback.used",
    );
  });

  it("normalizes hostile exports and never serializes unknown role names", async () => {
    const source = graph();
    const result = await createAntdAdapter({
      exportName: "themes; globalThis.pwned = true",
    }).compile(
      {
        ...source,
        schemes: source.schemes.map((scheme) => ({
          ...scheme,
          roles: {
            ...scheme.roles,
            'x"; globalThis.pwned = true; //': role(
              'x"; globalThis.pwned = true; //',
              "brand",
            ),
          },
        })),
      },
      {},
    );
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain("export const themes_globalThis_pwned_true = {");
    expect(content).not.toContain("globalThis.pwned = true");
    expect(result.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "antd.export-name.normalized",
        "antd.unsupported-role",
      ]),
    );
  });

  it.each(["eval", "arguments", "ThemeConfig", "antdTheme"])(
    "normalizes reserved export name %s",
    async (exportName) => {
      const result = await createAntdAdapter({ exportName }).compile(
        graph(),
        {},
      );
      expect(result.artifacts[0]?.content).toContain(
        `export const _${exportName} = {`,
      );
      expect(result.diagnostics?.map(({ code }) => code)).toContain(
        "antd.export-name.normalized",
      );
    },
  );

  it("fails closed for unsupported scheme identifiers", async () => {
    const source = graph();
    const result = await createAntdAdapter().compile(
      { ...source, schemes: [{ ...source.schemes[0]!, id: "contrast" }] },
      {},
    );

    expect(result.artifacts[0]?.content).toContain("export const themes = {");
    expect(result.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "antd.unsupported-scheme",
        "antd.no-supported-schemes",
      ]),
    );
  });

  it("runs through compileTheme with its preview and nested artifact", async () => {
    const result = await compileTheme(project(), [createAntdAdapter()]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Ant Design compilation to pass.");
    expect(result.previews["antd@6"]).toMatchObject({
      kind: "antd-theme-configs",
      targetVersion: "6",
    });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "antd/theme.ts",
          adapterId: "antd@6",
        }),
      ]),
    );
    expect(result.diagnostics.map(({ code }) => code)).not.toContain(
      "adapter.diagnostic.invalid",
    );
  });

  it("validates previews without invoking hostile accessors", async () => {
    const output = await createAntdAdapter().compile(graph(), {});
    expect(safeParseAntdAdapterPreview(output.preview).success).toBe(true);

    let reads = 0;
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "kind", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "antd-theme-configs";
      },
    });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(safeParseAntdAdapterPreview(accessor).success).toBe(false);
    expect(reads).toBe(0);
    expect(() => safeParseAntdAdapterPreview(proxy)).not.toThrow();
    expect(safeParseAntdAdapterPreview(proxy).success).toBe(false);
    expect(
      safeParseAntdAdapterPreview({
        kind: "antd-theme-configs",
        targetVersion: "6",
        themes: {
          light: {
            algorithm: "default",
            token: { "x; } body { color: red; /*": "#fff" },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("honors an already-aborted context", () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    expect(() =>
      createAntdAdapter().compile(graph(), { signal: controller.signal }),
    ).toThrow("stop");
  });
});

function project(): ThemeProject {
  const source = graph();
  return {
    schemaVersion: source.schemaVersion,
    id: source.projectId,
    ...(source.projectName === undefined ? {} : { name: source.projectName }),
    primitives: source.primitives.map((primitive) => ({
      ...primitive,
      id: `palette.${primitive.id}`,
    })),
    schemes: source.schemes.map((scheme) => ({
      id: scheme.id,
      roles: Object.fromEntries(
        Object.values(scheme.roles).map((resolvedRole) => [
          resolvedRole.role,
          { ref: `palette.${resolvedRole.ref}` },
        ]),
      ),
    })),
  };
}
