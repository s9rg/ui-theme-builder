export const THEME_PREVIEW_PROTOCOL = "@s9rg/theme-preview" as const;
export const THEME_PREVIEW_PROTOCOL_VERSION = 1 as const;

export const PREVIEW_PROFILES = ["light", "dark"] as const;
export type PreviewProfile = (typeof PREVIEW_PROFILES)[number];

export const PREVIEW_FIDELITIES = [
  "exact-runtime",
  "exact-css-variables",
  "mapped-preview",
  "native-web-approximation",
  "compile-verified",
] as const;
export type PreviewFidelity = (typeof PREVIEW_FIDELITIES)[number];

export interface PreviewSemanticColors {
  readonly background: string;
  readonly surface: string;
  readonly foreground: string;
  readonly muted: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly accent: string;
  readonly accentText: string;
  readonly border: string;
}

export interface ThemeUpdateMessage {
  readonly protocol: typeof THEME_PREVIEW_PROTOCOL;
  readonly version: typeof THEME_PREVIEW_PROTOCOL_VERSION;
  readonly type: "theme.update";
  readonly requestId: string;
  readonly payload: {
    readonly target: string;
    readonly profile: PreviewProfile;
    readonly fidelity: PreviewFidelity;
    readonly colors: PreviewSemanticColors;
  };
}

export interface PreviewReadyMessage {
  readonly protocol: typeof THEME_PREVIEW_PROTOCOL;
  readonly version: typeof THEME_PREVIEW_PROTOCOL_VERSION;
  readonly type: "preview.ready";
  readonly previewId: string;
}

export interface PreviewErrorMessage {
  readonly protocol: typeof THEME_PREVIEW_PROTOCOL;
  readonly version: typeof THEME_PREVIEW_PROTOCOL_VERSION;
  readonly type: "preview.error";
  readonly requestId: string;
  readonly error: {
    readonly code: "unsupported-target" | "invalid-theme" | "render-failed";
    readonly message: string;
  };
}

export type ThemePreviewMessage =
  ThemeUpdateMessage | PreviewReadyMessage | PreviewErrorMessage;

export type PreviewMessageParseResult =
  | { readonly success: true; readonly message: ThemePreviewMessage }
  | { readonly success: false; readonly issues: readonly string[] };

const semanticColorKeys = [
  "background",
  "surface",
  "foreground",
  "muted",
  "primary",
  "primaryText",
  "accent",
  "accentText",
  "border",
] as const satisfies readonly (keyof PreviewSemanticColors)[];

const errorCodes = [
  "unsupported-target",
  "invalid-theme",
  "render-failed",
] as const;

const MAX_MESSAGE_DEPTH = 16;
const MAX_MESSAGE_ENTRIES = 256;

/**
 * Snapshot an unknown message through property descriptors so validation never
 * invokes caller-provided accessors or consumes a mutable Proxy after checking
 * it. Protocol messages are deliberately small trees, so strict depth and
 * entry budgets also keep this non-throwing API total for hostile inputs.
 */
function snapshotMessageData(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let entries = 0;

  const snapshot = (candidate: unknown, depth: number): unknown => {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "number" ||
      typeof candidate === "boolean" ||
      candidate === undefined
    ) {
      return candidate;
    }
    if (typeof candidate !== "object" || seen.has(candidate)) {
      throw new TypeError("Message must contain an acyclic data tree");
    }
    if (depth > MAX_MESSAGE_DEPTH) {
      throw new TypeError("Message is nested too deeply");
    }
    seen.add(candidate);

    const arrayCandidate = Array.isArray(candidate);
    const prototype = Reflect.getPrototypeOf(candidate);
    if (
      (arrayCandidate && prototype !== Array.prototype) ||
      (!arrayCandidate && prototype !== Object.prototype && prototype !== null)
    ) {
      throw new TypeError("Message values must use plain data prototypes");
    }

    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const keys = Reflect.ownKeys(descriptors);
    entries += keys.length;
    if (entries > MAX_MESSAGE_ENTRIES) {
      throw new TypeError("Message contains too many entries");
    }

    const arrayLength = descriptors.length?.value as unknown;
    if (
      arrayCandidate &&
      (typeof arrayLength !== "number" ||
        !Number.isInteger(arrayLength) ||
        arrayLength < 0 ||
        arrayLength > 4_294_967_295)
    ) {
      throw new TypeError("Message contains an invalid array");
    }
    const result: unknown[] | Record<string, unknown> = arrayCandidate
      ? new Array<unknown>(arrayLength as number)
      : (Object.create(null) as Record<string, unknown>);
    let arrayElements = 0;

    for (const key of keys) {
      if (typeof key === "symbol") {
        throw new TypeError("Message contains a symbol property");
      }
      if (arrayCandidate && key === "length") continue;
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        throw new TypeError("Message contains an accessor property");
      }
      if (arrayCandidate && /^(?:0|[1-9]\d*)$/.test(key)) {
        arrayElements += 1;
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: descriptor.enumerable === true,
        writable: true,
        value: snapshot(descriptor.value, depth + 1),
      });
    }
    if (arrayCandidate && arrayElements !== arrayLength) {
      throw new TypeError("Message arrays must not be sparse");
    }
    return result;
  };

  return snapshot(value, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return false;
    const prototype = Object.getPrototypeOf(value) as object | null;
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  );
}

function isStrictHexColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
  );
}

function isMember<Value extends string>(
  value: unknown,
  values: readonly Value[],
): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

function validateEnvelope(
  value: Record<string, unknown>,
  issues: string[],
): void {
  if (value.protocol !== THEME_PREVIEW_PROTOCOL)
    issues.push("protocol is not supported");
  if (value.version !== THEME_PREVIEW_PROTOCOL_VERSION) {
    issues.push("protocol version is not supported");
  }
}

function validateThemeUpdate(
  value: Record<string, unknown>,
  issues: string[],
): boolean {
  if (
    !hasOnlyKeys(value, ["protocol", "version", "type", "requestId", "payload"])
  ) {
    issues.push("theme.update contains unknown fields");
  }
  if (!isBoundedString(value.requestId, 128))
    issues.push("requestId must be 1–128 characters");
  if (!isRecord(value.payload)) {
    issues.push("payload must be an object");
    return false;
  }

  const payload = value.payload;
  if (!hasOnlyKeys(payload, ["target", "profile", "fidelity", "colors"])) {
    issues.push("payload contains unknown fields");
  }
  if (!isBoundedString(payload.target, 128))
    issues.push("target must be 1–128 characters");
  if (!isMember(payload.profile, PREVIEW_PROFILES))
    issues.push("profile is not supported");
  if (!isMember(payload.fidelity, PREVIEW_FIDELITIES))
    issues.push("fidelity is not supported");
  if (!isRecord(payload.colors)) {
    issues.push("colors must be an object");
    return false;
  }
  if (!hasOnlyKeys(payload.colors, semanticColorKeys)) {
    issues.push("colors contains unknown fields");
  }
  for (const key of semanticColorKeys) {
    if (!isStrictHexColor(payload.colors[key])) {
      issues.push(`colors.${key} must be a strict hexadecimal color`);
    }
  }
  return issues.length === 0;
}

function validatePreviewReady(
  value: Record<string, unknown>,
  issues: string[],
): boolean {
  if (!hasOnlyKeys(value, ["protocol", "version", "type", "previewId"])) {
    issues.push("preview.ready contains unknown fields");
  }
  if (!isBoundedString(value.previewId, 128))
    issues.push("previewId must be 1–128 characters");
  return issues.length === 0;
}

function validatePreviewError(
  value: Record<string, unknown>,
  issues: string[],
): boolean {
  if (
    !hasOnlyKeys(value, ["protocol", "version", "type", "requestId", "error"])
  ) {
    issues.push("preview.error contains unknown fields");
  }
  if (!isBoundedString(value.requestId, 128))
    issues.push("requestId must be 1–128 characters");
  if (!isRecord(value.error)) {
    issues.push("error must be an object");
    return false;
  }
  if (!hasOnlyKeys(value.error, ["code", "message"])) {
    issues.push("error contains unknown fields");
  }
  if (!isMember(value.error.code, errorCodes))
    issues.push("error code is not supported");
  if (!isBoundedString(value.error.message, 512)) {
    issues.push("error message must be 1–512 characters");
  }
  return issues.length === 0;
}

export function safeParsePreviewMessage(
  value: unknown,
): PreviewMessageParseResult {
  try {
    const snapshot = snapshotMessageData(value);
    if (!isRecord(snapshot))
      return { success: false, issues: ["message must be a plain object"] };

    const issues: string[] = [];
    validateEnvelope(snapshot, issues);
    let valid = false;
    switch (snapshot.type) {
      case "theme.update":
        valid = validateThemeUpdate(snapshot, issues);
        break;
      case "preview.ready":
        valid = validatePreviewReady(snapshot, issues);
        break;
      case "preview.error":
        valid = validatePreviewError(snapshot, issues);
        break;
      default:
        issues.push("message type is not supported");
    }

    if (!valid || issues.length > 0) return { success: false, issues };
    return {
      success: true,
      message: snapshot as unknown as ThemePreviewMessage,
    };
  } catch {
    return {
      success: false,
      issues: ["message could not be safely inspected"],
    };
  }
}

export function assertPreviewMessage(
  value: unknown,
): asserts value is ThemePreviewMessage {
  const result = safeParsePreviewMessage(value);
  if (!result.success)
    throw new TypeError(`Invalid preview message: ${result.issues.join("; ")}`);
}

export function createThemeUpdateMessage(input: {
  readonly requestId: string;
  readonly target: string;
  readonly profile: PreviewProfile;
  readonly fidelity: PreviewFidelity;
  readonly colors: PreviewSemanticColors;
}): ThemeUpdateMessage {
  const message: ThemeUpdateMessage = {
    protocol: THEME_PREVIEW_PROTOCOL,
    version: THEME_PREVIEW_PROTOCOL_VERSION,
    type: "theme.update",
    requestId: input.requestId,
    payload: {
      target: input.target,
      profile: input.profile,
      fidelity: input.fidelity,
      colors: input.colors,
    },
  };
  assertPreviewMessage(message);
  return message;
}
