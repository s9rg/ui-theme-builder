import type { JsonValue } from "./types";

function canonicalize(value: unknown, stack: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Only finite numbers can be serialized.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object")
    throw new TypeError("Value is not JSON serializable.");
  if (stack.has(value))
    throw new TypeError("Circular value cannot be serialized.");
  stack.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry) => canonicalize(entry, stack));
    stack.delete(value);
    return result;
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of Object.keys(source).sort()) {
    const entry = source[key];
    if (entry !== undefined) result[key] = canonicalize(entry, stack);
  }
  stack.delete(value);
  return result;
}

/** Stable JSON: sorted object keys, preserved array order, normalized -0. */
export function stableStringify(
  value: JsonValue | object,
  indentation = 2,
): string {
  return `${JSON.stringify(canonicalize(value, new Set<object>()), null, indentation)}\n`;
}

export async function sha256(content: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error(
      "WebCrypto SubtleCrypto is required to calculate artifact hashes.",
    );
  }
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
