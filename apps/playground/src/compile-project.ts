import { compileTheme } from "@s9rg/theme-compiler";
import type { JsonValue, ThemeAdapter } from "@s9rg/theme-compiler";
import { colorwheelPaletteToThemeProject } from "@s9rg/theme-input-colorwheel";
import type { Palette } from "@s9rg/colorwheel/core";
import type { SchemeMappings, TargetKey } from "./model";

export interface WorkbenchFile {
  readonly path: string;
  readonly mediaType: string;
  readonly content: string;
  readonly adapterId: string;
}

export interface WorkbenchDiagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly adapterId?: string;
}

export interface WorkbenchCompilation {
  readonly ok: boolean;
  readonly files: readonly WorkbenchFile[];
  readonly diagnostics: readonly WorkbenchDiagnostic[];
  readonly previews: Readonly<Record<string, JsonValue>>;
}

const adapterFactories: Readonly<
  Record<TargetKey, () => Promise<ThemeAdapter>>
> = {
  dtcg: async () =>
    (await import("@s9rg/theme-adapter-dtcg")).createDtcgAdapter(),
  css: async () => (await import("@s9rg/theme-adapter-css")).createCssAdapter(),
  tailwind: async () =>
    (await import("@s9rg/theme-adapter-tailwind")).createTailwindAdapter(),
  mui: async () => (await import("@s9rg/theme-adapter-mui")).createMuiAdapter(),
  antd: async () =>
    (await import("@s9rg/theme-adapter-antd")).createAntdAdapter(),
  shadcn: async () =>
    (await import("@s9rg/theme-adapter-shadcn")).createShadcnAdapter(),
  daisyui: async () =>
    (await import("@s9rg/theme-adapter-daisyui")).createDaisyUiAdapter(),
  vuetify: async () =>
    (await import("@s9rg/theme-adapter-vuetify")).createVuetifyAdapter(),
  "angular-material": async () =>
    (
      await import("@s9rg/theme-adapter-angular-material")
    ).createAngularMaterialAdapter(),
  ionic: async () =>
    (await import("@s9rg/theme-adapter-ionic")).createIonicAdapter(),
  "react-native-paper": async () =>
    (
      await import("@s9rg/theme-adapter-react-native-paper")
    ).createReactNativePaperAdapter(),
};

function toText(content: string | Uint8Array): string {
  return typeof content === "string"
    ? content
    : new TextDecoder().decode(content);
}

function compilerRoles(
  mapping: SchemeMappings["light"],
): Readonly<Record<string, string>> {
  return {
    background: mapping.background,
    surface: mapping.surface,
    foreground: mapping.foreground,
    "muted-foreground": mapping.muted,
    primary: mapping.primary,
    "primary-foreground": mapping.primaryText,
    secondary: mapping.accent,
    "secondary-foreground": mapping.accentText,
    divider: mapping.border,
  };
}

export async function compileWorkbenchTheme(
  palette: Palette,
  mappings: SchemeMappings,
  target: TargetKey,
  signal?: AbortSignal,
): Promise<WorkbenchCompilation> {
  try {
    const project = colorwheelPaletteToThemeProject(palette, {
      id: "workbench-theme",
      name: palette.name ?? "Workbench theme",
      schemes: [
        { id: "light", label: "Light", roles: compilerRoles(mappings.light) },
        { id: "dark", label: "Dark", roles: compilerRoles(mappings.dark) },
      ],
    });
    const adapter = await adapterFactories[target]();
    const result = await compileTheme(project, [adapter], {
      ...(signal === undefined ? {} : { signal }),
    });
    const diagnostics = result.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
      ...(diagnostic.adapterId === undefined
        ? {}
        : { adapterId: diagnostic.adapterId }),
    }));

    if (!result.ok) {
      return {
        ok: false,
        files: [],
        diagnostics,
        previews: {},
      };
    }

    return {
      ok: true,
      files: result.artifacts.map((artifact) => ({
        path: artifact.path,
        mediaType: artifact.mediaType,
        content: toText(artifact.content),
        adapterId: artifact.adapterId,
      })),
      diagnostics,
      previews: result.previews,
    };
  } catch (error) {
    return {
      ok: false,
      files: [],
      diagnostics: [
        {
          severity: "error",
          code: "workbench.compile-failed",
          message:
            error instanceof Error ? error.message : "Theme compilation failed",
        },
      ],
      previews: {},
    };
  }
}
