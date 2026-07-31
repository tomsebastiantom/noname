import type { AssetDTO } from "../ports";

/** Public URL for an asset row — storageKey, original.url, or variants.original.url. */
export function iconUrlFromAsset(asset: AssetDTO | null): string | null {
  if (!asset) return null;
  const data = asset.data as Record<string, unknown>;
  const storageKey = typeof data.storageKey === "string" ? data.storageKey.trim() : "";
  if (storageKey) {
    const base = process.env.ASSET_PUBLIC_BASE_URL || "https://assets.noname.dev";
    return `${base}/${storageKey}`;
  }
  const original = data.original as { url?: string } | undefined;
  if (typeof original?.url === "string" && original.url.trim() !== "") {
    return original.url;
  }
  const variants = data.variants as Record<string, { url?: string }> | undefined;
  const variantUrl = variants?.original?.url;
  return typeof variantUrl === "string" && variantUrl.trim() !== "" ? variantUrl : null;
}
