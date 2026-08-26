import { describe, expect, it } from "vitest";
import { createHarmonyPalette } from "@s9rg/colorwheel/core";
import type { BuiltInHarmonyRule } from "@s9rg/colorwheel/core";
import { compileWorkbenchTheme } from "./compile-project";
import {
  buildThemePalette,
  decorateTheoryPalette,
  INITIAL_MAPPINGS,
  INITIAL_PALETTE,
} from "./model";
import type { SchemeMappings, TargetKey } from "./model";

describe("playground compilation", () => {
  it("compiles CSS and includes the deterministic lockfile", async () => {
    const result = await compileWorkbenchTheme(
      INITIAL_PALETTE,
      INITIAL_MAPPINGS,
      "css",
    );

    expect(result.ok).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual([
      "theme.css",
      "theme.lock.json",
    ]);
    expect(result.previews["css@1"]).toMatchObject({
      kind: "css-custom-properties",
    });
  });

  it("uses the adapter's exact MUI v9 model for runtime preview", async () => {
    const result = await compileWorkbenchTheme(
      INITIAL_PALETTE,
      INITIAL_MAPPINGS,
      "mui",
    );
    const preview = result.previews["mui@9"];

    expect(result.ok).toBe(true);
    expect(preview).toMatchObject({
      kind: "mui-theme-options",
      targetVersion: "9",
      themeOptions: {
        cssVariables: { colorSchemeSelector: "data" },
        colorSchemes: {
          light: {
            palette: {
              primary: { main: "#be123c", contrastText: "#ffffff" },
              secondary: {
                main: "#007678",
                contrastText: "#ffffff",
              },
              background: { default: "#f8fafe", paper: "#ffffff" },
              text: {
                primary: "#13161f",
                secondary: "#66708a",
              },
              divider: "#d9deea",
            },
          },
          dark: {
            palette: {
              primary: { main: "#be123c", contrastText: "#ffffff" },
              secondary: { main: "#007678", contrastText: "#ffffff" },
              background: { default: "#07090f", paper: "#13161f" },
              text: { primary: "#ffffff", secondary: "#9aa3b4" },
              divider: "#2a303d",
            },
          },
        },
      },
    });
  });

  it("honors an already-aborted compile request", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await compileWorkbenchTheme(
      INITIAL_PALETTE,
      INITIAL_MAPPINGS,
      "tailwind",
      controller.signal,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "compile.aborted" }),
      ]),
    );
  });

  it.each([
    { type: "complementary" },
    { type: "analogous", count: 3, spread: 30 },
    { type: "triadic" },
    { type: "split-complementary", spread: 60 },
    { type: "tetradic" },
    { type: "monochromatic", count: 5 },
  ] satisfies readonly BuiltInHarmonyRule[])(
    "compiles the %s theory recipe through every launch target",
    async (harmony) => {
      const theory = decorateTheoryPalette(
        createHarmonyPalette({ seed: "#be123c", harmony }),
      );
      const seedId = theory.recipe?.seedColorId;
      const accentId = theory.recipe?.colorSlotIds?.find(
        (colorId) => colorId !== seedId,
      );
      expect(seedId).toBeDefined();
      expect(accentId).toBeDefined();
      const mappings: SchemeMappings = {
        light: {
          ...INITIAL_MAPPINGS.light,
          primary: seedId!,
          accent: accentId!,
        },
        dark: {
          ...INITIAL_MAPPINGS.dark,
          primary: seedId!,
          accent: accentId!,
        },
      };
      const palette = buildThemePalette(theory);

      for (const target of [
        "css",
        "tailwind",
        "mui",
        "dtcg",
      ] as const satisfies readonly TargetKey[]) {
        const result = await compileWorkbenchTheme(palette, mappings, target);
        expect(result.ok, `${harmony.type} -> ${target}`).toBe(true);
        expect(result.files.length).toBeGreaterThan(0);
      }
    },
  );
});
