import { describe, expect, it } from "vitest";
import {
  assertPreviewMessage,
  createThemeUpdateMessage,
  safeParsePreviewMessage,
  THEME_PREVIEW_PROTOCOL,
  THEME_PREVIEW_PROTOCOL_VERSION,
} from "./index";

const colors = {
  background: "#ffffff",
  surface: "#f8fafc",
  foreground: "#111827",
  muted: "#64748b",
  primary: "#6d28d9",
  primaryText: "#ffffff",
  accent: "#0d9488",
  accentText: "#ffffff",
  border: "#d1d5db",
} as const;

describe("preview message schema", () => {
  it("creates and validates a theme update", () => {
    const message = createThemeUpdateMessage({
      requestId: "request-1",
      target: "mui@9",
      profile: "light",
      fidelity: "mapped-preview",
      colors,
    });

    expect(message.protocol).toBe(THEME_PREVIEW_PROTOCOL);
    expect(message.version).toBe(THEME_PREVIEW_PROTOCOL_VERSION);
    expect(safeParsePreviewMessage(message)).toEqual({
      success: true,
      message,
    });
  });

  it("rejects unknown fields instead of silently accepting them", () => {
    const result = safeParsePreviewMessage({
      ...createThemeUpdateMessage({
        requestId: "request-1",
        target: "css@1",
        profile: "dark",
        fidelity: "exact-css-variables",
        colors,
      }),
      source: "alert(1)",
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.issues).toContain("theme.update contains unknown fields");
  });

  it("rejects an incomplete semantic payload", () => {
    const result = safeParsePreviewMessage({
      protocol: THEME_PREVIEW_PROTOCOL,
      version: THEME_PREVIEW_PROTOCOL_VERSION,
      type: "theme.update",
      requestId: "request-2",
      payload: {
        target: "tailwind@4",
        profile: "light",
        fidelity: "mapped-preview",
        colors: { primary: "#000000" },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContain(
        "colors.background must be a strict hexadecimal color",
      );
    }
  });

  it("rejects strings that could escape into a CSS value", () => {
    const result = safeParsePreviewMessage({
      ...createThemeUpdateMessage({
        requestId: "request-safe",
        target: "css@1",
        profile: "light",
        fidelity: "exact-css-variables",
        colors,
      }),
      payload: {
        target: "css@1",
        profile: "light",
        fidelity: "exact-css-variables",
        colors: { ...colors, background: "url(javascript:alert(1))" },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContain(
        "colors.background must be a strict hexadecimal color",
      );
    }
  });

  it("returns validation failures for accessors and hostile proxies", () => {
    let reads = 0;
    const accessorMessage: Record<string, unknown> = {};
    Object.defineProperty(accessorMessage, "protocol", {
      enumerable: true,
      get: () => {
        reads += 1;
        throw new Error("protocol getter must not run");
      },
    });

    expect(() => safeParsePreviewMessage(accessorMessage)).not.toThrow();
    expect(safeParsePreviewMessage(accessorMessage)).toEqual({
      success: false,
      issues: ["message could not be safely inspected"],
    });
    expect(reads).toBe(0);
    expect(() => assertPreviewMessage(accessorMessage)).toThrow(
      /could not be safely inspected/,
    );
    expect(reads).toBe(0);

    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    expect(() => safeParsePreviewMessage(revocable.proxy)).not.toThrow();
    expect(safeParsePreviewMessage(revocable.proxy)).toEqual({
      success: false,
      issues: ["message could not be safely inspected"],
    });
  });
});
