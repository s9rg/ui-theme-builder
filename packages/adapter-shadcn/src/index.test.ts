import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import {
  createShadcnAdapter,
  safeParseShadcnAdapterPreview,
  shadcnAdapterManifest,
} from "./index.js";

const colors = {
  brand: color("#2563eb", [37 / 255, 99 / 255, 235 / 255]),
  accent: color("#a855f7", [168 / 255, 85 / 255, 247 / 255]),
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
          "secondary-foreground": role("secondary-foreground", "white"),
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
          primary: role("primary", "accent"),
          "primary-foreground": role("primary-foreground", "ink"),
          secondary: role("secondary", "brand"),
          "secondary-foreground": role("secondary-foreground", "white"),
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

describe("shadcn adapter", () => {
  it("exposes its shadcn v4 registry contract", () => {
    expect(shadcnAdapterManifest).toMatchObject({
      id: "shadcn@4",
      engineApiVersion: "1",
      adapterVersion: "0.6.0",
      maturity: "beta",
      target: { name: "shadcn", version: ">=4 <5" },
      capabilities: {
        colors: {
          native: ["srgb", "hsl", "oklch"],
          fallback: "srgb-hex",
        },
        schemes: { count: "multiple", ids: ["light", "dark"] },
        preview: true,
      },
    });
  });

  it("emits deterministic official registry:theme JSON", async () => {
    const source = graph();
    const reordered: ThemeGraph = {
      ...source,
      primitives: [...source.primitives].reverse(),
      schemes: [...source.schemes].reverse().map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(Object.entries(scheme.roles).reverse()),
      })),
    };
    const first = await createShadcnAdapter().compile(source, {});
    const second = await createShadcnAdapter().compile(reordered, {});
    const item = JSON.parse(first.artifacts[0]?.content ?? "null") as {
      $schema: string;
      type: string;
      cssVars: Record<string, Record<string, string>>;
    };

    expect(first.artifacts).toEqual(second.artifacts);
    expect(first.artifacts[0]).toMatchObject({
      path: "shadcn/theme.json",
      mediaType: "application/json",
    });
    expect(item.$schema).toBe(
      "https://ui.shadcn.com/schema/registry-item.json",
    );
    expect(item.type).toBe("registry:theme");
    expect(item.cssVars.light).toMatchObject({
      background: "rgb(97.254902% 98.039216% 98.823529%)",
      card: "rgb(100% 100% 100%)",
      "card-foreground": "rgb(2.745098% 3.529412% 5.882353%)",
      popover: "rgb(100% 100% 100%)",
      primary: "rgb(14.509804% 38.823529% 92.156863%)",
      "primary-foreground": "rgb(100% 100% 100%)",
      secondary: "rgb(65.882353% 33.333333% 96.862745%)",
      "muted-foreground": "rgb(39.215686% 45.490196% 54.509804%)",
      border: "rgb(85.882353% 89.019608% 93.72549%)",
    });
    expect(first.preview).toMatchObject({
      kind: "shadcn-registry-theme",
      targetVersion: "4",
      name: "generated-theme",
      cssVars: { light: {}, dark: {} },
    });
    expect(first.diagnostics?.map(({ code }) => code)).toContain(
      "shadcn.partial-theme",
    );
  });

  it("prefers an explicit surface foreground over the general foreground", async () => {
    const source = graph();
    const light = source.schemes[0]!;
    const result = await createShadcnAdapter().compile(
      {
        ...source,
        schemes: [
          {
            ...light,
            roles: {
              ...light.roles,
              "surface-foreground": role("surface-foreground", "brand"),
            },
          },
        ],
      },
      {},
    );
    const item = JSON.parse(result.artifacts[0]?.content ?? "null") as {
      cssVars: { light: Record<string, string> };
    };

    expect(item.cssVars.light["card-foreground"]).toBe(
      "rgb(14.509804% 38.823529% 92.156863%)",
    );
    expect(result.diagnostics?.map(({ code }) => code)).toContain(
      "shadcn.role-precedence",
    );
  });

  it("preserves CLI-supported OKLCH values without reducing their gamut", async () => {
    const vivid: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.72, 0.28, 12],
      alpha: 0.8,
    };
    const source: ThemeGraph = {
      ...graph(),
      primitives: [{ id: "vivid", $type: "color", value: vivid }],
      schemes: [
        {
          id: "light",
          roles: { primary: { role: "primary", ref: "vivid", value: vivid } },
        },
      ],
    };
    const result = await createShadcnAdapter().compile(source, {});

    expect(result.artifacts[0]?.content).toContain(
      '"primary": "oklch(0.72 0.28 12 / 0.8)"',
    );
  });

  it("uses a declared sRGB fallback instead of emitting CLI-invalid HWB", async () => {
    const vivid: ResolvedColor = {
      colorSpace: "hwb",
      components: [12, 4, 8],
      alpha: 0.5,
      hex: "#ff3366",
    };
    const source: ThemeGraph = {
      ...graph(),
      primitives: [{ id: "vivid", $type: "color", value: vivid }],
      schemes: [
        {
          id: "light",
          roles: { primary: { role: "primary", ref: "vivid", value: vivid } },
        },
      ],
    };
    const result = await createShadcnAdapter().compile(source, {});
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain('"primary": "#ff336680"');
    expect(content).not.toContain("hsl(hwb(");
    expect(content).not.toContain("hwb(");
    expect(result.diagnostics?.map(({ code }) => code)).toContain(
      "shadcn.color-fallback.used",
    );
  });

  it("fails closed when an unsupported color has no sRGB fallback", async () => {
    const unsupported: ResolvedColor = {
      colorSpace: "hwb",
      components: [12, 4, 8],
      alpha: 1,
    };
    const source: ThemeGraph = {
      ...graph(),
      primitives: [{ id: "unsupported", $type: "color", value: unsupported }],
      schemes: [
        {
          id: "light",
          roles: {
            primary: {
              role: "primary",
              ref: "unsupported",
              value: unsupported,
            },
          },
        },
      ],
    };
    const result = await createShadcnAdapter().compile(source, {});
    const item = JSON.parse(result.artifacts[0]?.content ?? "null") as {
      cssVars: { light: Record<string, string> };
    };

    expect(item.cssVars.light.primary).toBeUndefined();
    expect(result.diagnostics?.map(({ code }) => code)).toContain(
      "shadcn.color.unsupported",
    );
  });

  it("normalizes hostile item names and omits unknown role names", async () => {
    const source = graph();
    const result = await createShadcnAdapter({
      itemName: '../X"},"files":[{"path":"pwn"}]',
    }).compile(
      {
        ...source,
        schemes: source.schemes.map((scheme) => ({
          ...scheme,
          roles: {
            ...scheme.roles,
            '__proto__";url(javascript:x)': role(
              '__proto__";url(javascript:x)',
              "brand",
            ),
          },
        })),
      },
      {},
    );
    const item = JSON.parse(result.artifacts[0]?.content ?? "null") as {
      name: string;
      files?: unknown;
    };

    expect(item.name).toBe("x-files-path-pwn");
    expect(item.files).toBeUndefined();
    expect(result.artifacts[0]?.content).not.toContain("javascript:");
    expect(result.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "shadcn.item-name.normalized",
        "shadcn.unsupported-role",
      ]),
    );
  });

  it("fails closed for unsupported scheme IDs", async () => {
    const source = graph();
    const result = await createShadcnAdapter().compile(
      { ...source, schemes: [{ ...source.schemes[0]!, id: "contrast" }] },
      {},
    );
    const item = JSON.parse(result.artifacts[0]?.content ?? "null") as {
      cssVars: object;
    };

    expect(item.cssVars).toEqual({});
    expect(result.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "shadcn.unsupported-scheme",
        "shadcn.no-supported-schemes",
      ]),
    );
  });

  it("runs through compileTheme with a valid preview and artifact", async () => {
    const result = await compileTheme(project(), [createShadcnAdapter()]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected shadcn compilation to pass.");
    expect(result.previews["shadcn@4"]).toMatchObject({
      kind: "shadcn-registry-theme",
      targetVersion: "4",
    });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "shadcn/theme.json",
          adapterId: "shadcn@4",
        }),
      ]),
    );
    expect(result.diagnostics.map(({ code }) => code)).not.toContain(
      "adapter.diagnostic.invalid",
    );
  });

  it("validates previews without invoking hostile accessors", async () => {
    const output = await createShadcnAdapter().compile(graph(), {});
    expect(safeParseShadcnAdapterPreview(output.preview).success).toBe(true);

    let reads = 0;
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "kind", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "shadcn-registry-theme";
      },
    });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(safeParseShadcnAdapterPreview(accessor).success).toBe(false);
    expect(reads).toBe(0);
    expect(() => safeParseShadcnAdapterPreview(proxy)).not.toThrow();
    expect(
      safeParseShadcnAdapterPreview({
        kind: "shadcn-registry-theme",
        targetVersion: "4",
        name: "safe",
        cssVars: {
          light: { "x; } body { color: red; /*": "#fff" },
        },
      }).success,
    ).toBe(false);
  });

  it("honors an already-aborted context", () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    expect(() =>
      createShadcnAdapter().compile(graph(), { signal: controller.signal }),
    ).toThrow("stop");
  });
});

function project(): ThemeProject {
  const source = graph();
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
        Object.values(scheme.roles).map((resolvedRole) => [
          resolvedRole.role,
          { ref: `palette.${resolvedRole.ref}` },
        ]),
      ),
    })),
  };
}
