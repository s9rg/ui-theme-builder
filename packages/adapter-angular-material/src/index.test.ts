import {
  Hct,
  TonalPalette,
  argbFromHex,
  hexFromArgb,
} from "@material/material-color-utilities";
import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import {
  angularMaterialAdapterManifest,
  createAngularMaterialAdapter,
} from "./index.js";

const palette = {
  brand: color("#6750a4", [0.404, 0.314, 0.643]),
  accent: color("#0066cc", [0, 0.4, 0.8]),
  white: color("#ffffff", [1, 1, 1]),
  ink: color("#1d1b20", [0.114, 0.106, 0.125]),
  surface: color("#fffbfe", [1, 0.984, 0.996]),
  border: color("#79747e", [0.475, 0.455, 0.494]),
} as const;

describe("Angular Material adapter", () => {
  it("publishes the Material v22 capability contract", () => {
    expect(angularMaterialAdapterManifest).toMatchObject({
      id: "angular-material@22",
      adapterVersion: "0.6.0",
      target: { name: "@angular/material", version: ">=22 <23" },
      capabilities: {
        colors: { native: ["srgb"], fallback: "srgb-hex" },
        roles: { required: ["primary"] },
      },
    });
  });

  it("emits real deterministic MCU tonal maps and explicit overrides", async () => {
    const source = graph();
    const reordered: ThemeGraph = {
      ...source,
      primitives: [...source.primitives].reverse(),
      schemes: [...source.schemes].reverse().map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(Object.entries(scheme.roles).reverse()),
      })),
    };
    const first = await createAngularMaterialAdapter().compile(source, {});
    const second = await createAngularMaterialAdapter().compile(reordered, {});
    expect(first.artifacts).toEqual(second.artifacts);
    const scss = first.artifacts[0]?.content ?? "";
    const expectedTone40 = hexFromArgb(
      TonalPalette.fromHct(Hct.fromInt(argbFromHex("#6750a4"))).tone(40),
    );
    expect(scss).toContain(`40: ${expectedTone40},`);
    expect(scss).toContain(
      "neutral-variant: map.get($_light-palettes, neutral-variant)",
    );
    expect(scss).toContain("@include mat.theme((");
    expect(scss).toContain("theme-type: light");
    expect(scss).toContain("@include mat.theme-overrides((");
    expect(scss).toContain("on-primary: #ffffff");
    expect(scss).toContain("on-background: #1d1b20");
    expect(scss).toContain("outline-variant: #79747e");
    expect(scss).toContain(".theme-dark {");
    expect(scss.indexOf(":root {")).toBeLessThan(scss.indexOf(".theme-dark {"));
    expect(scss).not.toContain("unknown-role");
    expect(first.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "angular-material.palettes.derived",
        "angular-material.system-tokens.generated",
        "angular-material.unsupported-role",
      ]),
    );
  });

  it("rejects hostile selectors without allowing Sass injection", async () => {
    const result = await createAngularMaterialAdapter({
      darkSelector: ".dark { @error hacked; }",
    }).compile(graph(), {});
    const scss = result.artifacts[0]?.content ?? "";
    expect(scss).toContain(".theme-dark {");
    expect(scss).not.toContain("@error hacked");
    expect(result.diagnostics?.map(({ code }) => code)).toContain(
      "angular-material.dark-selector.rejected",
    );
  });

  it("uses sRGB fallbacks and fails closed for translucent seeds", async () => {
    const fallback: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.7, 0.2, 30],
      alpha: 1,
      hex: "#ff3366",
    };
    const direct = await createAngularMaterialAdapter().compile(
      singleColorGraph(fallback),
      {},
    );
    expect(direct.artifacts[0]?.content).toContain("$_light-palettes");
    expect(direct.diagnostics?.map(({ code }) => code)).toContain(
      "angular-material.color-fallback.used",
    );

    const compiled = await compileTheme(
      project(singleColorGraph({ ...fallback, alpha: 0.5 })),
      [createAngularMaterialAdapter()],
    );
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({ code: "angular-material.alpha.unsupported" }),
    );
  });

  it("runs through compileTheme and snapshots configuration", async () => {
    const options = { darkSelector: '[data-mode="dark"]' };
    const adapter = createAngularMaterialAdapter(options);
    options.darkSelector = ".changed";
    expect(adapter.configuration).toEqual({
      darkSelector: '[data-mode="dark"]',
    });
    const result = await compileTheme(project(), [adapter]);
    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("Expected Angular Material compilation to succeed");
    expect(result.artifacts).toContainEqual(
      expect.objectContaining({
        path: "angular-material.theme.scss",
        adapterId: "angular-material@22",
      }),
    );
    expect(result.previews["angular-material@22"]).toMatchObject({
      kind: "angular-material-m3",
      targetVersion: "22",
    });
  });
});

function graph(): ThemeGraph {
  return {
    schemaVersion: "1.0",
    projectId: "material-fixture",
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
          background: role("background", "surface"),
          surface: role("surface", "white"),
          foreground: role("foreground", "ink"),
          divider: role("divider", "border"),
          "unknown-role": role("unknown-role", "accent"),
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
