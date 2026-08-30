import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import {
  createDaisyUiAdapter,
  daisyUiAdapterManifest,
  safeParseDaisyUiAdapterPreview,
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

describe("daisyUI adapter", () => {
  it("exposes its daisyUI v5 capability contract", () => {
    expect(daisyUiAdapterManifest).toMatchObject({
      id: "daisyui@5",
      engineApiVersion: "1",
      adapterVersion: "0.6.0",
      maturity: "beta",
      target: { name: "daisyui", version: ">=5 <6" },
      capabilities: {
        colors: { native: "passthrough", fallback: "none" },
        schemes: { count: "multiple", ids: ["light", "dark"] },
        preview: true,
      },
    });
  });

  it("emits deterministic documented light and dark plugin overrides", async () => {
    const source = graph();
    const reordered: ThemeGraph = {
      ...source,
      primitives: [...source.primitives].reverse(),
      schemes: [...source.schemes].reverse().map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(Object.entries(scheme.roles).reverse()),
      })),
    };
    const first = await createDaisyUiAdapter().compile(source, {});
    const second = await createDaisyUiAdapter().compile(reordered, {});
    const content = first.artifacts[0]?.content ?? "";

    expect(first.artifacts).toEqual(second.artifacts);
    expect(first.artifacts[0]).toMatchObject({
      path: "daisyui/theme.css",
      mediaType: "text/css",
    });
    expect(content).toContain('@plugin "daisyui" {');
    expect(content).toContain("themes: light --default, dark --prefersdark;");
    expect(content.match(/@plugin "daisyui\/theme"/g)).toHaveLength(2);
    expect(content).toContain('name: "light";');
    expect(content).toContain("--color-base-100: color(srgb 1 1 1);");
    expect(content).toContain(
      "--color-base-200: color(srgb 0.972549 0.980392 0.988235);",
    );
    expect(content).toContain(
      "--color-base-300: color(srgb 0.858824 0.890196 0.937255);",
    );
    expect(content).toContain(
      "--color-primary: color(srgb 0.145098 0.388235 0.921569);",
    );
    expect(first.preview).toMatchObject({
      kind: "daisyui-theme",
      targetVersion: "5",
      themes: {
        light: { colorScheme: "light", variables: {} },
        dark: { colorScheme: "dark", variables: {} },
      },
    });
    expect(first.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "daisyui.muted-foreground.omitted",
        "daisyui.builtin-inheritance",
      ]),
    );
  });

  it("maps exact optional state roles without inventing missing colors", async () => {
    const source = graph();
    const light = source.schemes[0]!;
    const result = await createDaisyUiAdapter().compile(
      {
        ...source,
        schemes: [
          {
            ...light,
            roles: {
              ...light.roles,
              accent: role("accent", "accent"),
              "accent-foreground": role("accent-foreground", "white"),
              success: role("success", "brand"),
              "success-foreground": role("success-foreground", "white"),
            },
          },
        ],
      },
      {},
    );
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain("--color-accent:");
    expect(content).toContain("--color-accent-content:");
    expect(content).toContain("--color-success:");
    expect(content).not.toContain("--color-error:");
  });

  it("passes CSS Color 4 values through without reducing their gamut", async () => {
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
    const result = await createDaisyUiAdapter().compile(source, {});

    expect(result.artifacts[0]?.content).toContain(
      "--color-primary: oklch(0.72 0.28 12 / 0.8);",
    );
  });

  it("omits hostile unknown roles from generated CSS", async () => {
    const source = graph();
    const result = await createDaisyUiAdapter().compile(
      {
        ...source,
        schemes: source.schemes.map((scheme) => ({
          ...scheme,
          roles: {
            ...scheme.roles,
            'x; } body { background: url("javascript:x")': role(
              'x; } body { background: url("javascript:x")',
              "brand",
            ),
          },
        })),
      },
      {},
    );

    expect(result.artifacts[0]?.content).not.toContain("javascript:");
    expect(result.diagnostics?.map(({ code }) => code)).toContain(
      "daisyui.unsupported-role",
    );
  });

  it("fails closed for unsupported scheme IDs", async () => {
    const source = graph();
    const result = await createDaisyUiAdapter().compile(
      { ...source, schemes: [{ ...source.schemes[0]!, id: "contrast" }] },
      {},
    );

    expect(result.artifacts[0]?.content).not.toContain(
      '@plugin "daisyui/theme"',
    );
    expect(result.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "daisyui.unsupported-scheme",
        "daisyui.no-supported-schemes",
      ]),
    );
  });

  it("runs through compileTheme with a valid preview and artifact", async () => {
    const result = await compileTheme(project(), [createDaisyUiAdapter()]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected daisyUI compilation to pass.");
    expect(result.previews["daisyui@5"]).toMatchObject({
      kind: "daisyui-theme",
      targetVersion: "5",
    });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "daisyui/theme.css",
          adapterId: "daisyui@5",
        }),
      ]),
    );
    expect(result.diagnostics.map(({ code }) => code)).not.toContain(
      "adapter.diagnostic.invalid",
    );
  });

  it("validates previews without invoking hostile accessors", async () => {
    const output = await createDaisyUiAdapter().compile(graph(), {});
    expect(safeParseDaisyUiAdapterPreview(output.preview).success).toBe(true);

    let reads = 0;
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "kind", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "daisyui-theme";
      },
    });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(safeParseDaisyUiAdapterPreview(accessor).success).toBe(false);
    expect(reads).toBe(0);
    expect(() => safeParseDaisyUiAdapterPreview(proxy)).not.toThrow();
  });

  it("honors an already-aborted context", () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    expect(() =>
      createDaisyUiAdapter().compile(graph(), { signal: controller.signal }),
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
