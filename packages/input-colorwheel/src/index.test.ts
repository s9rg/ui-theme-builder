import { describe, expect, it } from "vitest";
import type { Palette, PaletteDocument } from "@s9rg/colorwheel/core";
import { colorwheelPaletteToThemeProject } from "./index";

const palette: Palette = {
  name: "Launch palette",
  kind: "custom",
  provenance: { origin: "manual" },
  colors: [
    {
      id: "brand",
      name: "Brand",
      color: { space: "srgb", r: 0.4, g: 0.2, b: 0.8 },
    },
    { id: "paper", name: "Paper", color: { space: "srgb", r: 1, g: 1, b: 1 } },
  ],
};

describe("colorwheelPaletteToThemeProject", () => {
  it("preserves palette identity and explicit semantic mappings", () => {
    const document: PaletteDocument = {
      schema: "color-palette",
      schemaVersion: 1,
      palette,
    };

    const project = colorwheelPaletteToThemeProject(document, {
      id: "launch",
      schemes: [
        {
          id: "light",
          roles: { primary: "brand", background: "paper" },
        },
      ],
    });

    expect(project.id).toBe("launch");
    expect(project.name).toBe("Launch palette");
    expect(project.primitives).toHaveLength(2);
    expect(project.schemes[0]?.roles.primary).toEqual({ ref: "palette.brand" });
    expect(project.primitives[0]?.value.hex).toBe("#6633cc");
  });

  it("rejects a role that points to a missing Colorwheel entry", () => {
    expect(() =>
      colorwheelPaletteToThemeProject(palette, {
        schemes: [{ id: "light", roles: { primary: "missing" } }],
      }),
    ).toThrow(/unknown Colorwheel color/);
  });

  it("keeps primitive IDs stable across swatch renames", () => {
    const renamed = colorwheelPaletteToThemeProject({
      ...palette,
      colors: [
        { ...palette.colors[0]!, name: "A completely new label" },
        palette.colors[1]!,
      ],
    });

    expect(renamed.primitives.map((primitive) => primitive.id)).toEqual([
      "palette.brand",
      "palette.paper",
    ]);
    expect(renamed.primitives[0]?.label).toBe("A completely new label");
  });

  it("uses an unlabeled entry's original ID as its display label", () => {
    const project = colorwheelPaletteToThemeProject({
      ...palette,
      colors: [
        {
          id: "Brand / Primary",
          color: { space: "srgb", r: 0.1, g: 0.2, b: 0.3 },
        },
      ],
    });

    expect(project.primitives[0]).toMatchObject({
      id: "palette.brand-primary",
      label: "Brand / Primary",
    });
  });

  it("keeps DTCG hex fallbacks six-digit while preserving alpha separately", () => {
    const project = colorwheelPaletteToThemeProject({
      ...palette,
      colors: [
        {
          id: "overlay",
          color: { space: "srgb", r: 0.2, g: 0.4, b: 0.6, alpha: 0.35 },
        },
      ],
    });

    expect(project.primitives[0]?.value).toMatchObject({
      hex: "#336699",
      alpha: 0.35,
    });
  });

  it("allocates colliding IDs deterministically across reorder", () => {
    const colors: Palette["colors"] = [
      {
        id: "Brand blue",
        name: "First",
        color: { space: "srgb", r: 0, g: 0, b: 1 },
      },
      {
        id: "brand-blue",
        name: "Second",
        color: { space: "srgb", r: 0, g: 0.2, b: 0.8 },
      },
    ];
    const first = colorwheelPaletteToThemeProject({ ...palette, colors });
    const reordered = colorwheelPaletteToThemeProject({
      ...palette,
      colors: [...colors].reverse(),
    });

    const byLabel = (project: typeof first): Record<string, string> =>
      Object.fromEntries(
        project.primitives.map((primitive) => {
          if (primitive.label === undefined)
            throw new Error("Expected a primitive label");
          return [primitive.label, primitive.id] as const;
        }),
      );
    expect(byLabel(reordered)).toEqual(byLabel(first));
    expect(
      new Set(first.primitives.map((primitive) => primitive.id)).size,
    ).toBe(2);
  });

  it("keeps globally colliding normalized candidates distinct", () => {
    const colors: Palette["colors"] = [
      {
        id: "foo!",
        name: "Punctuation one",
        color: { space: "srgb", r: 0.1, g: 0.2, b: 0.3 },
      },
      {
        id: "foo?",
        name: "Punctuation two",
        color: { space: "srgb", r: 0.4, g: 0.5, b: 0.6 },
      },
      {
        // `foo!` hashes to 8050dd42, so this unique base collides with the
        // disambiguated candidate for the first normalized `foo` entry.
        id: "foo-8050dd42",
        name: "Literal hash suffix",
        color: { space: "srgb", r: 0.7, g: 0.8, b: 0.9 },
      },
    ];
    const options = {
      schemes: [
        {
          id: "light",
          roles: { first: "foo!", literal: "foo-8050dd42" },
        },
      ],
    } as const;
    const first = colorwheelPaletteToThemeProject(
      { ...palette, colors },
      options,
    );
    const reordered = colorwheelPaletteToThemeProject(
      { ...palette, colors: [...colors].reverse() },
      options,
    );

    expect(first.primitives).toHaveLength(3);
    expect(
      new Set(first.primitives.map((primitive) => primitive.id)).size,
    ).toBe(3);
    expect(first.schemes[0]?.roles.first?.ref).not.toBe(
      first.schemes[0]?.roles.literal?.ref,
    );
    expect(reordered.schemes).toEqual(first.schemes);
  });

  it("keeps semantic references stable when colors are reordered", () => {
    const original = colorwheelPaletteToThemeProject(palette, {
      schemes: [
        { id: "light", roles: { primary: "brand", background: "paper" } },
      ],
    });
    const reordered = colorwheelPaletteToThemeProject(
      { ...palette, colors: [...palette.colors].reverse() },
      {
        schemes: [
          { id: "light", roles: { primary: "brand", background: "paper" } },
        ],
      },
    );

    expect(reordered.schemes).toEqual(original.schemes);
  });
});
