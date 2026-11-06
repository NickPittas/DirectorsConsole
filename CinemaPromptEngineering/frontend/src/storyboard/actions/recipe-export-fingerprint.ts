const MAX_SCHEMA_BYTES = 16 * 1024 * 1024;

function stableJson(value: unknown): string {
  const parts: string[] = [];
  const encoder = new TextEncoder();
  let bytes = 0;
  const append = (part: string): void => {
    bytes += encoder.encode(part).byteLength;
    if (bytes > MAX_SCHEMA_BYTES) throw new Error("json_size");
    parts.push(part);
  };
  const visit = (item: unknown, depth: number): void => {
    if (depth > 64) throw new Error("json_depth");
    if (item === null || typeof item === "boolean") return append(JSON.stringify(item));
    if (typeof item === "string") {
      if (item.length > MAX_SCHEMA_BYTES) throw new Error("json_size");
      return append(JSON.stringify(item));
    }
    if (typeof item === "number" && Number.isFinite(item)) return append(JSON.stringify(item));
    if (Array.isArray(item)) {
      append("[");
      item.forEach((child, index) => {
        if (index > 0) append(",");
        visit(child, depth + 1);
      });
      return append("]");
    }
    if (item !== null && typeof item === "object" && (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null)) {
      append("{");
      Object.keys(item).sort().forEach((key, index) => {
        if (index > 0) append(",");
        append(JSON.stringify(key));
        append(":");
        visit((item as Record<string, unknown>)[key], depth + 1);
      });
      return append("}");
    }
    throw new Error("json_value_invalid");
  };
  visit(value, 0);
  return parts.join("");
}

export async function fingerprintRecipeExport(value: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (typeof TextEncoder === "undefined" || typeof subtle?.digest !== "function") {
    throw new Error("Browser SHA-256 fingerprinting is unavailable.");
  }

  const encoded = new TextEncoder().encode(stableJson(value));
  const digest = await subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
