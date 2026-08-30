import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import { createIonicAdapter, ionicAdapterManifest } from "./index.js";

const palette = {
  green: color("#006600", [0, 0.4, 0]),
  white: color("#ffffff", [1, 1, 1]),
  black: color("#000000", [0, 0, 0]),
  paper: color("#f5f7fa", [0.961, 0.969, 0.98]),
  border: color("#d0d5dd", [0.816, 0.835, 0.867]),
} as const;

describe("Ionic adapter", () => {
  it("publishes its cross-framework Ionic v9 contract", () => {
    expect(ionicAdapterManifest).toMatchObject({
      id: "ionic@9",
      adapterVersion: "0.6.0",
      target: { name: "@ionic/core", version: ">=9 <10" },
      capabilities: {
        colors: { native: ["srgb"], fallback: "srgb-hex" },
        roles: { required: ["primary"] },
      },
    });
  });

  it("emits exact layered and stepped color derivations deterministically", async () => {
    const source = graph();
    const reordered: ThemeGraph = {
      ...source,
      primitives: [...source.primitives].reverse(),
      schemes: [...source.schemes].reverse().map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(Object.entries(scheme.roles).reverse()),
      })),
    };
    const first = await createIonicAdapter().compile(source, {});
    const second = await createIonicAdapter().compile(reordered, {});
    expect(first.artifacts).toEqual(second.artifacts);
    const css = first.artifacts[0]?.content ?? "";
    expect(css).toContain("--ion-color-primary: #006600;");
    expect(css).toContain("--ion-color-primary-rgb: 0,102,0;");
    expect(css).toContain("--ion-color-primary-contrast: #ffffff;");
    expect(css).toContain("--ion-color-primary-shade: #005a00;");
    expect(css).toContain("--ion-color-primary-tint: #1a751a;");
    expect(css).toContain("--ion-text-color-step-50: #0d0d0d;");
    expect(css).toContain("--ion-background-color-step-50: #f2f2f2;");
    expect(css).toContain("--ion-card-background: #f5f7fa;");
    expect(css).toContain(".ion-palette-dark {");
    expect(css.indexOf(":root {")).toBeLessThan(
      css.indexOf(".ion-palette-dark {"),
    );
    expect(css).not.toContain("unknown-role");
  });

  it("rejects hostile selectors and reports target derivations", async () => {
    const result = await createIonicAdapter({
      darkSelector: '.dark {} body { background: url("x") }',
    }).compile(graph(), {});
    const css = result.artifacts[0]?.content ?? "";
    expect(css).toContain(".ion-palette-dark {");
    expect(css).not.toContain("url(");
    expect(result.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "ionic.dark-selector.rejected",
        "ionic.stepped-colors.derived",
        "ionic.unsupported-role",
      ]),
    );
  });

  it("uses declared sRGB fallbacks and rejects translucent layers", async () => {
    const fallback: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.7, 0.2, 30],
      alpha: 1,
      hex: "#ff3366",
    };
    const direct = await createIonicAdapter().compile(
      singleColorGraph(fallback),
      {},
    );
    expect(direct.artifacts[0]?.content).toContain(
      "--ion-color-primary: #ff3366;",
    );
    expect(direct.diagnostics?.map(({ code }) => code)).toContain(
      "ionic.color-fallback.used",
    );

    const translucent = singleColorGraph({ ...fallback, alpha: 0.5 });
    const compiled = await compileTheme(project(translucent), [
      createIonicAdapter(),
    ]);
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ionic.alpha.unsupported" }),
    );
  });

  it("runs through compileTheme and snapshots options", async () => {
    const options = { darkSelector: '[data-mode="dark"]' };
    const adapter = createIonicAdapter(options);
    options.darkSelector = ".changed";
    expect(adapter.configuration).toEqual({
      darkSelector: '[data-mode="dark"]',
    });
    const result = await compileTheme(project(), [adapter]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Ionic compilation to succeed");
    expect(result.artifacts).toContainEqual(
      expect.objectContaining({
        path: "ionic.theme.css",
        adapterId: "ionic@9",
      }),
    );
    expect(result.previews["ionic@9"]).toMatchObject({
      kind: "ionic-css-variables",
      targetVersion: "9",
    });
  });
});

function graph(): ThemeGraph {
  return {
    schemaVersion: "1.0",
    projectId: "ionic-fixture",
    primitives: Object.entries(palette).map(([id, value]) => ({
      id,
      $type: "color",
      value,
    })),
    schemes: [
      {
        id: "light",
        roles: {
          primary: role("primary", "green"),
          "primary-foreground": role("primary-foreground", "white"),
          background: role("background", "white"),
          surface: role("surface", "paper"),
          foreground: role("foreground", "black"),
          divider: role("divider", "border"),
          "unknown-role": role("unknown-role", "green"),
        },
      },
      {
        id: "dark",
        roles: {
          primary: role("primary", "green"),
          "primary-foreground": role("primary-foreground", "white"),
          background: role("background", "black"),
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
