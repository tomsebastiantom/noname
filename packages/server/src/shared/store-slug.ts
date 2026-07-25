const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RESERVED_STORE_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "cdn",
  "edge",
  "health",
  "localhost",
  "login",
  "static",
  "www",
]);

export function normalizeStoreSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function assertValidStoreSlug(slug: string): void {
  const normalized = normalizeStoreSlug(slug);
  if (!normalized || normalized.length > 63) {
    throw new Error("Store slug must be 1–63 characters");
  }
  if (!STORE_SLUG_PATTERN.test(normalized)) {
    throw new Error("Store slug may only contain lowercase letters, numbers, and hyphens");
  }
  if (RESERVED_STORE_SLUGS.has(normalized)) {
    throw new Error(`Store slug "${normalized}" is reserved`);
  }
}

export function storeSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0]?.trim() ?? "";
  const sub = hostname.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127") return null;
  return sub;
}
