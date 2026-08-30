import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import {
  createReactNativePaperAdapter,
  reactNativePaperAdapterManifest,
} from "./index.js";

const colors = {
  brand: color("#0066cc", [0, 0.4, 0.8]),
  accent: color("#8b5cf6", [0.545, 0.361, 0.965]),
  container: color("#dbeafe", [0.859, 0.918, 0.996]),
  tertiary: color("#0f766e", [0.059, 0.463, 0.431]),
  white: color("#ffffff", [1, 1, 1]),
  navy: color("#050a14", [0.02, 0.04, 0.08]),
  surface: color("#f5f7fa", [0.961, 0.969, 0.98]),
  darkSurface: color("#111827", [0.067, 0.094, 0.153]),
  muted: color("#667085", [0.4, 0.439, 0.522]),
  divider: color("#d0d5dd", [0.816, 0.835, 0.867]),
  error: color("#b42318", [0.706, 0.137, 0.094]),
  elevation: color("#eef2ff", [0.933, 0.949, 1]),
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
          "primary-container": role("primary-container", "container"),
          "primary-container-foreground": role(
            "primary-container-foreground",
            "navy",
          ),
          secondary: role("secondary", "accent"),
          tertiary: role("tertiary", "tertiary"),
          "tertiary-foreground": role("tertiary-foreground", "white"),
          background: role("background", "white"),
          surface: role("surface", "surface"),
          foreground: role("foreground", "navy"),
          "muted-foreground": role("muted-foreground", "muted"),
          divider: role("divider", "divider"),
          error: role("error", "error"),
          "error-foreground": role("error-foreground", "white"),
          "elevation-level-1": role("elevation-level-1", "elevation"),
          "component-special": role("component-special", "accent"),
        },
      },
      {
        id: "dark",
        roles: {
          primary: role("primary", "accent"),
          "on-primary": role("on-primary", "navy"),
          background: role("background", "navy"),
          surface: role("surface", "darkSurface"),
          "on-surface": role("on-surface", "white"),
          "on-background": role("on-background", "white"),
          outline: role("outline", "divider"),
        },
      },
    ],
  };
}

describe("React Native Paper adapter", () => {
  it("exposes the React Native Paper v5 capability contract", () => {
    expect(reactNativePaperAdapterManifest).toMatchObject({
      id: "react-native-paper@5",
      engineApiVersion: "1",
      adapterVersion: "0.6.0",
      maturity: "beta",
      target: { name: "react-native-paper", version: ">=5 <6" },
      capabilities: {
        colors: { native: ["srgb", "hsl"], fallback: "srgb-hex" },
        schemes: { count: "multiple", ids: ["light", "dark"] },
        roles: { requirement: "optional", required: [] },
        preview: true,
      },
      options: {},
    });
  });

  it("emits deterministic MD3 overrides and preserves Paper defaults", async () => {
    const adapter = createReactNativePaperAdapter();
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

    expect(first.artifacts).toEqual(second.artifacts);
    expect(first.artifacts).toHaveLength(1);
    expect(first.artifacts[0]).toMatchObject({
      path: "react-native-paper/theme.ts",
      mediaType: "text/typescript",
    });

    const content = first.artifacts[0]?.content ?? "";
    expect(content).toContain("...MD3LightTheme");
    expect(content).toContain("...MD3DarkTheme");
    expect(content).toContain('"primary": "#0066cc"');
    expect(content).toContain('"primaryContainer": "#dbeafe"');
    expect(content).toContain('"onPrimaryContainer": "#050a14"');
    expect(content).toContain('"onSurface": "#050a14"');
    expect(content).toContain('"onBackground": "#050a14"');
    expect(content).toContain('"onSurfaceVariant": "#667085"');
    expect(content).toContain('"outlineVariant": "#d0d5dd"');
    expect(content).toContain("...MD3LightTheme.colors.elevation");
    expect(content).toContain('"level1": "#eef2ff"');
    expect(content).not.toContain("component-special");
    expect(content).toContain("satisfies MD3Theme");
    expect(content).toContain("export const paperThemes");
    expect(content).toContain("export default lightTheme");

    expect(first.preview).toMatchObject({
      kind: "react-native-paper-themes",
      targetVersion: "5",
      themes: {
        light: {
          base: "MD3LightTheme",
          colors: {
            primary: "#0066cc",
            onSurface: "#050a14",
            onBackground: "#050a14",
            elevation: { level1: "#eef2ff" },
          },
        },
        dark: {
          base: "MD3DarkTheme",
          colors: { primary: "#8b5cf6", onPrimary: "#050a14" },
        },
      },
    });
    expect(first.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "react-native-paper.role.unsupported",
        "react-native-paper.defaults.inherited",
      ]),
    );
    expect(
      first.diagnostics?.find(
        ({ code, path }) =>
          code === "react-native-paper.defaults.inherited" &&
          path?.[1] === "light",
      )?.message,
    ).toContain("No Material tones were synthesized");
  });

  it("maps every explicit MD3 v5 color role without leaving light color defaults", async () => {
    const canonicalRoles = {
      primary: role("primary", "brand"),
      "primary-container": role("primary-container", "brand"),
      secondary: role("secondary", "brand"),
      "secondary-container": role("secondary-container", "brand"),
      tertiary: role("tertiary", "brand"),
      "tertiary-container": role("tertiary-container", "brand"),
      surface: role("surface", "brand"),
      "surface-variant": role("surface-variant", "brand"),
      "surface-disabled": role("surface-disabled", "brand"),
      background: role("background", "brand"),
      error: role("error", "brand"),
      "error-container": role("error-container", "brand"),
      "on-primary": role("on-primary", "brand"),
      "on-primary-container": role("on-primary-container", "brand"),
      "on-secondary": role("on-secondary", "brand"),
      "on-secondary-container": role("on-secondary-container", "brand"),
      "on-tertiary": role("on-tertiary", "brand"),
      "on-tertiary-container": role("on-tertiary-container", "brand"),
      "on-surface": role("on-surface", "brand"),
      "on-surface-variant": role("on-surface-variant", "brand"),
      "on-surface-disabled": role("on-surface-disabled", "brand"),
      "on-error": role("on-error", "brand"),
      "on-error-container": role("on-error-container", "brand"),
      "on-background": role("on-background", "brand"),
      outline: role("outline", "brand"),
      "outline-variant": role("outline-variant", "brand"),
      "inverse-surface": role("inverse-surface", "brand"),
      "inverse-on-surface": role("inverse-on-surface", "brand"),
      "inverse-primary": role("inverse-primary", "brand"),
      shadow: role("shadow", "brand"),
      scrim: role("scrim", "brand"),
      backdrop: role("backdrop", "brand"),
      "elevation-level-0": role("elevation-level-0", "brand"),
      "elevation-level-1": role("elevation-level-1", "brand"),
      "elevation-level-2": role("elevation-level-2", "brand"),
      "elevation-level-3": role("elevation-level-3", "brand"),
      "elevation-level-4": role("elevation-level-4", "brand"),
      "elevation-level-5": role("elevation-level-5", "brand"),
    };
    const source = graph();
    const complete: ThemeGraph = {
      ...source,
      schemes: [{ id: "light", roles: canonicalRoles }],
    };
    const result = await createReactNativePaperAdapter().compile(complete, {});
    const content = result.artifacts[0]?.content ?? "";

    for (const targetKey of [
      "primaryContainer",
      "onSecondaryContainer",
      "surfaceDisabled",
      "onSurfaceDisabled",
      "outlineVariant",
      "inverseOnSurface",
      "backdrop",
      "level5",
    ]) {
      expect(content).toContain(`"${targetKey}": "#0066cc"`);
    }
    expect(
      result.diagnostics?.some(
        ({ code, path }) =>
          code === "react-native-paper.defaults.inherited" &&
          path?.[1] === "light",
      ),
    ).toBe(false);
    const missingDark = result.diagnostics?.find(
      ({ code, message }) =>
        code === "react-native-paper.defaults.inherited" &&
        message.includes("No dark scheme was supplied"),
    );
    expect(missingDark).toBeDefined();
  });

  it("prefers target-specific roles over generic foreground and divider aliases", async () => {
    const source = graph();
    const colliding: ThemeGraph = {
      ...source,
      schemes: [
        {
          id: "light",
          roles: {
            "on-primary": role("on-primary", "accent"),
            "primary-foreground": role("primary-foreground", "white"),
            outline: role("outline", "brand"),
            "outline-variant": role("outline-variant", "brand"),
            divider: role("divider", "divider"),
          },
        },
      ],
    };
    const result = await createReactNativePaperAdapter().compile(colliding, {});
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain('"onPrimary": "#8b5cf6"');
    expect(content).toContain('"outline": "#0066cc"');
    expect(content).toContain('"outlineVariant": "#0066cc"');
    expect(content).not.toContain('"onPrimary": "#ffffff"');
    expect(
      result.diagnostics?.filter(
        ({ code }) => code === "react-native-paper.role.collision",
      ),
    ).toHaveLength(2);
  });

  it("uses declared sRGB fallbacks, preserves HSL, and fails closed otherwise", async () => {
    const fallback: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.72, 0.28, 12],
      alpha: 0.5,
      hex: "#ff3366",
    };
    const hsl: ResolvedColor = {
      colorSpace: "hsl",
      components: [210, 80, 45],
      alpha: 0.75,
      hex: "#176bcf",
    };
    const unsupported: ResolvedColor = {
      colorSpace: "oklch",
      components: [0.7, 0.2, 40],
      alpha: 1,
    };
    const source = graph();
    const colorGraph: ThemeGraph = {
      ...source,
      primitives: [
        { id: "fallback", $type: "color", value: fallback },
        { id: "hsl", $type: "color", value: hsl },
        { id: "unsupported", $type: "color", value: unsupported },
      ],
      schemes: [
        {
          id: "light",
          roles: {
            primary: { role: "primary", ref: "fallback", value: fallback },
            secondary: { role: "secondary", ref: "hsl", value: hsl },
            tertiary: {
              role: "tertiary",
              ref: "unsupported",
              value: unsupported,
            },
          },
        },
      ],
    };
    const direct = await createReactNativePaperAdapter().compile(
      colorGraph,
      {},
    );
    const content = direct.artifacts[0]?.content ?? "";

    expect(content).toContain('"primary": "rgba(255, 51, 102, 0.5)"');
    expect(content).toContain('"secondary": "hsla(210, 80%, 45%, 0.75)"');
    expect(content).not.toContain('"tertiary"');
    expect(direct.diagnostics?.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "react-native-paper.color-fallback.used",
        "react-native-paper.color.unsupported",
      ]),
    );

    const compiled = await compileTheme(project(colorGraph), [
      createReactNativePaperAdapter(),
    ]);
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "adapter.color-space.unsupported",
      }),
    );
  });

  it("contains hostile metadata and malformed fallback strings", async () => {
    const hostile: ResolvedColor = {
      colorSpace: "srgb",
      components: [0.1, 0.2, 0.3],
      alpha: 1,
      hex: '"; globalThis.pwned = true; //',
    };
    const hostileGraph: ThemeGraph = {
      schemaVersion: "1.0",
      projectId: 'project"; throw new Error("pwned")',
      projectName: "</script><script>globalThis.pwned=true</script>",
      primitives: [{ id: "hostile", $type: "color", value: hostile }],
      schemes: [
        {
          id: "light",
          label: "`; globalThis.pwned = true; //",
          roles: {
            primary: {
              role: "primary",
              ref: "hostile",
              value: hostile,
            },
          },
        },
      ],
    };
    const result = await createReactNativePaperAdapter().compile(
      hostileGraph,
      {},
    );
    const content = result.artifacts[0]?.content ?? "";

    expect(content).toContain('"primary": "rgb(26, 51, 77)"');
    expect(content).not.toContain("globalThis");
    expect(content).not.toContain("</script>");
    expect(result.artifacts[0]?.path).toBe("react-native-paper/theme.ts");
  });

  it("fails closed for unsupported schemes while still rendering safe bases", async () => {
    const source = graph();
    const unsupportedScheme: ThemeGraph = {
      ...source,
      schemes: [{ ...source.schemes[0]!, id: "high-contrast" }],
    };
    const direct = await createReactNativePaperAdapter().compile(
      unsupportedScheme,
      {},
    );

    expect(direct.artifacts[0]?.content).toContain("...MD3LightTheme");
    expect(direct.artifacts[0]?.content).toContain("...MD3DarkTheme");
    expect(direct.diagnostics?.map(({ code }) => code)).toContain(
      "react-native-paper.scheme.unsupported",
    );

    const compiled = await compileTheme(project(unsupportedScheme), [
      createReactNativePaperAdapter(),
    ]);
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({ code: "adapter.scheme-id.unsupported" }),
    );
  });

  it("runs through compileTheme with a safe artifact, preview, and lock entry", async () => {
    const source = graph();
    const supported: ThemeGraph = {
      ...source,
      schemes: source.schemes.map((scheme) => ({
        ...scheme,
        roles: Object.fromEntries(
          Object.entries(scheme.roles).filter(
            ([roleName]) => roleName !== "component-special",
          ),
        ),
      })),
    };
    const result = await compileTheme(project(supported), [
      createReactNativePaperAdapter(),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Paper compilation to succeed.");
    expect(result.previews["react-native-paper@5"]).toMatchObject({
      kind: "react-native-paper-themes",
      targetVersion: "5",
    });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "react-native-paper/theme.ts",
          adapterId: "react-native-paper@5",
        }),
        expect.objectContaining({ path: "theme.lock.json" }),
      ]),
    );
    expect(
      result.diagnostics.map((diagnostic) => diagnostic.code),
    ).not.toContain("adapter.diagnostic.invalid");
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
