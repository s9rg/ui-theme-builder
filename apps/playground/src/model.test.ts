import { describe, expect, it } from "vitest";
import { createHarmonyPalette } from "@s9rg/colorwheel/core";
import type { BuiltInHarmonyRule } from "@s9rg/colorwheel/core";
import {
  buildThemePalette,
  cssColor,
  decorateTheoryPalette,
  getContrastChecks,
  INITIAL_MAPPINGS,
  INITIAL_PALETTE,
  INITIAL_THEORY_PALETTE,
  reconcileMappings,
  SUPPORTING_COLORS,
  TARGETS,
} from "./model";

describe("workbench model", () => {
  it("formats controlled Colorwheel values as portable sRGB hex", () => {
    expect(cssColor(INITIAL_PALETTE, "brand")).toBe("#be123c");
  });

  it("starts with a two-color complementary recipe, not independent pickers", () => {
    expect(INITIAL_THEORY_PALETTE.colors.map((entry) => entry.id)).toEqual([
      "brand",
      "accent",
    ]);
    expect(INITIAL_THEORY_PALETTE.recipe).toMatchObject({
      seedColorId: "brand",
      colorSlotIds: ["brand", "accent"],
      harmony: { type: "complementary" },
    });
    expect(INITIAL_PALETTE.colors).toHaveLength(
      INITIAL_THEORY_PALETTE.colors.length + SUPPORTING_COLORS.length,
    );
  });

  it.each([
    [{ type: "complementary" }, 2, 0],
    [{ type: "analogous", count: 3, spread: 30 }, 3, 1],
    [{ type: "triadic" }, 3, 0],
    [{ type: "split-complementary", spread: 60 }, 3, 0],
    [{ type: "tetradic" }, 4, 0],
    [{ type: "monochromatic", count: 5 }, 5, 2],
  ] satisfies readonly [BuiltInHarmonyRule, number, number][])(
    "generates %s as a dense theory palette",
    (harmony, count, expectedSeedIndex) => {
      const palette = createHarmonyPalette({ seed: "#be123c", harmony });
      expect(palette.colors).toHaveLength(count);
      expect(new Set(palette.recipe?.colorSlotIds).size).toBe(count);
      expect(palette.recipe?.seedColorId).toBe(
        palette.colors[expectedSeedIndex]?.id,
      );
    },
  );

  it("repairs only mappings whose generated color disappeared", () => {
    const expanded = decorateTheoryPalette(
      createHarmonyPalette({
        seed: "#be123c",
        harmony: { type: "tetradic" },
        idFactory: (index) =>
          ["brand", "accent", "generated-3", "generated-4"][index]!,
      }),
    );
    const custom = {
      light: { ...INITIAL_MAPPINGS.light, accent: "generated-4" },
      dark: { ...INITIAL_MAPPINGS.dark, border: "generated-3" },
    };
    expect(buildThemePalette(expanded).colors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "generated-3" }),
        expect.objectContaining({ id: "generated-4" }),
      ]),
    );

    const reconciled = reconcileMappings(INITIAL_PALETTE, custom);
    expect(reconciled.light.accent).toBe("accent");
    expect(reconciled.dark.border).toBe("graphite");
    expect(reconciled.light.primary).toBe("brand");
  });

  it("labels MUI exact-runtime and keeps weaker previews explicit", () => {
    expect(TARGETS.map(({ key, fidelity }) => [key, fidelity])).toEqual([
      ["css", "exact-css-variables"],
      ["tailwind", "mapped-preview"],
      ["mui", "exact-runtime"],
      ["dtcg", "mapped-preview"],
      ["antd", "mapped-preview"],
      ["shadcn", "mapped-preview"],
      ["daisyui", "mapped-preview"],
      ["vuetify", "mapped-preview"],
      ["angular-material", "compile-verified"],
      ["ionic", "mapped-preview"],
      ["react-native-paper", "native-web-approximation"],
    ]);
    expect(new Set(TARGETS.map((target) => target.adapterId)).size).toBe(11);
  });

  it("reports every declared contrast pair", () => {
    const checks = getContrastChecks(INITIAL_PALETTE, INITIAL_MAPPINGS.light);
    expect(checks.map((check) => check.label)).toEqual([
      "Body text",
      "Muted text",
      "Primary label",
      "Accent label",
    ]);
    expect(checks.every((check) => Number.isFinite(check.ratio))).toBe(true);
  });
});
