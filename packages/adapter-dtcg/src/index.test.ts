import { describe, expect, it } from "vitest";
import { compileTheme } from "@s9rg/theme-compiler";
import type {
  ResolvedColor,
  ThemeGraph,
  ThemeProject,
} from "@s9rg/theme-compiler";
import { createDtcgAdapter, dtcgAdapterManifest } from "./index.js";

const brand: ResolvedColor = {
  colorSpace: "srgb",
  components: [0, 0.4, 0.8],
  alpha: 1,
  hex: "#0066cc",
};
const white: ResolvedColor = {
  colorSpace: "srgb",
  components: [1, 1, 1],
  alpha: 1,
  hex: "#ffffff",
};
const navy: ResolvedColor = {
  colorSpace: "srgb",
  components: [0.02, 0.04, 0.08],
  alpha: 1,
  hex: "#050a14",
};

function graph(): ThemeGraph {
  return {
    schemaVersion: "1.0",
    projectId: "acme",
    projectName: "Acme",
    primitives: [
      { id: "white", $type: "color", value: white },
      { id: "brand", $type: "color", value: brand, label: "Brand blue" },
      { id: "navy", $type: "color", value: navy },
    ],
    schemes: [
      {
        id: "light",
        roles: {
          "primary-foreground": {
            role: "primary-foreground",
            ref: "white",
            value: white,
          },
          primary: { role: "primary", ref: "brand", value: brand },
          background: { role: "background", ref: "white", value: white },
        },
      },
      {
        id: "dark",
        roles: {
          background: { role: "background", ref: "navy", value: navy },
          primary: { role: "primary", ref: "brand", value: brand },
          "primary-foreground": {
            role: "primary-foreground",
            ref: "white",
            value: white,
          },
        },
      },
    ],
  };
}

describe("DTCG adapter", () => {
  it("exposes its versioned capability manifest", () => {
    expect(dtcgAdapterManifest).toMatchObject({
      id: "dtcg@2025.10",
      engineApiVersion: "1",
      maturity: "beta",
      target: { version: "2025.10" },
      capabilities: {
        colors: { native: "passthrough", fallback: "none" },
        schemes: { count: "multiple", ids: "any" },
        preview: true,
      },
      options: { filePrefix: { type: "string", default: "theme" } },
    });
  });

  it("snapshots normalized options at factory creation", async () => {
    const options = { filePrefix: "Product Theme" };
    const adapter = createDtcgAdapter(options);
    options.filePrefix = "changed";

    expect(adapter.configuration).toEqual({ filePrefix: "product-theme" });
    const result = await adapter.compile(graph(), {});
    expect(result.artifacts[0]?.path).toBe(
      "product-theme.primitives.tokens.json",
    );
  });

  it("emits deterministic DTCG token files and a 2025.10 resolver", async () => {
    const adapter = createDtcgAdapter();
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
    expect(first.artifacts.map((artifact) => artifact.path)).toEqual([
      "theme.primitives.tokens.json",
      "theme.dark.tokens.json",
      "theme.light.tokens.json",
      "theme.resolver.json",
    ]);
    expect(
      first.artifacts
        .filter((artifact) => artifact.path.endsWith(".tokens.json"))
        .map((artifact) => artifact.mediaType),
    ).toEqual([
      "application/design-tokens+json",
      "application/design-tokens+json",
      "application/design-tokens+json",
    ]);
    expect(
      requireArtifact(first.artifacts, "theme.resolver.json").mediaType,
    ).toBe("application/json");

    const primitiveArtifact = requireArtifact(
      first.artifacts,
      "theme.primitives.tokens.json",
    );
    expect(primitiveArtifact.content).toBe(
      `${JSON.stringify(
        {
          $schema: "https://www.designtokens.org/schemas/2025.10/format.json",
          color: {
            palette: {
              brand: {
                $type: "color",
                $value: {
                  colorSpace: "srgb",
                  components: [0, 0.4, 0.8],
                  alpha: 1,
                  hex: "#0066cc",
                },
                $description: "Brand blue",
              },
              navy: {
                $type: "color",
                $value: {
                  colorSpace: "srgb",
                  components: [0.02, 0.04, 0.08],
                  alpha: 1,
                  hex: "#050a14",
                },
              },
              white: {
                $type: "color",
                $value: {
                  colorSpace: "srgb",
                  components: [1, 1, 1],
                  alpha: 1,
                  hex: "#ffffff",
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    const resolverArtifact = requireArtifact(
      first.artifacts,
      "theme.resolver.json",
    );
    expect(JSON.parse(resolverArtifact.content)).toEqual({
      $schema: "https://www.designtokens.org/schemas/2025.10/resolver.json",
      name: "Acme",
      version: "2025.10",
      sets: {
        foundation: {
          description: "Primitive color tokens",
          sources: [{ $ref: "./theme.primitives.tokens.json" }],
        },
      },
      modifiers: {
        theme: {
          description: "Color scheme",
          contexts: {
            dark: [{ $ref: "./theme.dark.tokens.json" }],
            light: [{ $ref: "./theme.light.tokens.json" }],
          },
          default: "light",
        },
      },
      resolutionOrder: [
        { $ref: "#/sets/foundation" },
        { $ref: "#/modifiers/theme" },
      ],
    });

    const lightArtifact = requireArtifact(
      first.artifacts,
      "theme.light.tokens.json",
    );
    const lightTokens: unknown = JSON.parse(lightArtifact.content);
    expect(lightTokens).toMatchObject({
      color: { semantic: { primary: { $value: "{color.palette.brand}" } } },
    });
  });

  it("normalizes hostile file and token names without emitting unsafe paths", async () => {
    const hostile: ThemeGraph = {
      ...graph(),
      primitives: [
        {
          id: '__proto__/../../<script>alert("x")</script>',
          $type: "color",
          value: brand,
          label: '</script>\u2028"quoted"',
        },
      ],
      schemes: [],
    };

    const result = await createDtcgAdapter({
      filePrefix: "../../out/evil",
    }).compile(hostile, {});

    expect(
      result.artifacts.every(
        (artifact) =>
          !artifact.path.includes("/") && !artifact.path.includes(".."),
      ),
    ).toBe(true);
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toContain(
      "dtcg.file-prefix.normalized",
    );
    for (const artifact of result.artifacts) {
      expect(() => {
        JSON.parse(artifact.content);
      }).not.toThrow();
    }
  });

  it("emits a six-digit DTCG hex fallback with alpha kept separately", async () => {
    const translucent: ResolvedColor = {
      colorSpace: "srgb",
      components: [0.2, 0.4, 0.6],
      alpha: 0.5,
      hex: "#33669980",
    };
    const source: ThemeGraph = {
      ...graph(),
      primitives: [
        { id: "palette.translucent", $type: "color", value: translucent },
      ],
      schemes: [],
    };
    const result = await createDtcgAdapter().compile(source, {});
    const tokens: unknown = JSON.parse(
      requireArtifact(result.artifacts, "theme.primitives.tokens.json").content,
    );

    expect(tokens).toMatchObject({
      color: {
        palette: {
          translucent: {
            $value: { hex: "#336699", alpha: 0.5 },
          },
        },
      },
    });
  });

  it("uses a set for a single scheme and diagnoses the missing dark context", async () => {
    const source = graph();
    const single: ThemeGraph = {
      ...source,
      schemes: source.schemes.filter((scheme) => scheme.id === "light"),
    };
    const result = await createDtcgAdapter().compile(single, {});
    const resolverArtifact = requireArtifact(
      result.artifacts,
      "theme.resolver.json",
    );
    const resolver: unknown = JSON.parse(resolverArtifact.content);

    expect(resolver).toMatchObject({
      sets: { scheme: { description: "Semantic color scheme" } },
      resolutionOrder: [
        { $ref: "#/sets/foundation" },
        { $ref: "#/sets/scheme" },
      ],
    });
    expect(resolverArtifact.content).not.toContain('"modifiers"');
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "dtcg.single-scheme",
        "dtcg.missing-dark-scheme",
      ]),
    );
  });

  it("reserves the primitive artifact name from scheme identifiers", async () => {
    const source = graph();
    const result = await createDtcgAdapter().compile(
      {
        ...source,
        schemes: [{ id: "primitives", roles: source.schemes[0]!.roles }],
      },
      {},
    );
    const paths = result.artifacts.map((artifact) => artifact.path);

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("theme.primitives.tokens.json");
    expect(paths).toContain("theme.primitives-46c14d5f.tokens.json");
  });

  it("allocates unique names when normalized values and FNV hashes collide", async () => {
    const result = await createDtcgAdapter().compile(
      {
        ...graph(),
        primitives: [
          {
            id: "collision:)*#!name",
            $type: "color",
            value: brand,
          },
          {
            id: "collision^*^$!name",
            $type: "color",
            value: white,
          },
        ],
        schemes: [],
      },
      {},
    );
    const tokens = JSON.parse(
      requireArtifact(result.artifacts, "theme.primitives.tokens.json").content,
    ) as { readonly color: { readonly palette: Record<string, unknown> } };

    expect(Object.keys(tokens.color.palette)).toEqual([
      "collision-name-53cbed73",
      "collision-name-53cbed73-2",
    ]);
  });

  it("runs through compileTheme with valid diagnostics and preview JSON", async () => {
    const result = await compileTheme(project(), [createDtcgAdapter()]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected DTCG compilation to succeed.");
    expect(result.previews["dtcg@2025.10"]).toMatchObject({
      kind: "dtcg",
      version: "2025.10",
    });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "theme.resolver.json",
          adapterId: "dtcg@2025.10",
        }),
      ]),
    );
    const primitives = requireArtifact(
      result.artifacts,
      "theme.primitives.tokens.json",
    ).content;
    expect(primitives).toContain('"brand"');
    expect(primitives).not.toContain('"palette-brand"');
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

function requireArtifact(
  artifacts: readonly {
    readonly path: string;
    readonly mediaType: string;
    readonly content: string;
  }[],
  path: string,
): {
  readonly path: string;
  readonly mediaType: string;
  readonly content: string;
} {
  const artifact = artifacts.find((candidate) => candidate.path === path);
  if (artifact === undefined) throw new Error(`Missing artifact ${path}`);
  return artifact;
}
