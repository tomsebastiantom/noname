/** Must match server default in documents/assets/url.ts until a shared package exists. */
export const DEFAULT_ASSET_PUBLIC_BASE_URL = "https://assets.noname.dev";

export function urlFromStorageKey(storageKey: string): string {
  return `${DEFAULT_ASSET_PUBLIC_BASE_URL}/${storageKey}`;
}

/** Public URL from asset row data — mirrors server iconUrlFromAsset resolution order. */
export function assetUrlFromData(data: Record<string, unknown>): string | null {
  const storageKey = typeof data.storageKey === "string" ? data.storageKey.trim() : "";
  if (storageKey) {
    return urlFromStorageKey(storageKey);
  }
  const original = data.original as { url?: string } | undefined;
  if (typeof original?.url === "string" && original.url.trim() !== "") {
    return original.url;
  }
  const variants = data.variants as Record<string, { url?: string }> | undefined;
  const variantUrl = variants?.original?.url;
  return typeof variantUrl === "string" && variantUrl.trim() !== "" ? variantUrl : null;
}
