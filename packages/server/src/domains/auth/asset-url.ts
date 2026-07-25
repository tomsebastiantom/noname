import type { AssetDocumentService, AssetDTO } from "../documents/ports";

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

/** Resolve stored media refs to public icon URLs for GET /auth/config. */
export async function resolveProviderIconUrls(
  orgId: string,
  providers: string[],
  iconAssets: Record<string, { assetId: string }>,
  assets: AssetDocumentService,
): Promise<Record<string, string>> {
  const icons: Record<string, string> = {};

  for (const providerId of providers) {
    const assetId = iconAssets[providerId]?.assetId?.trim();
    if (!assetId) continue;
    const asset = await assets.get(orgId, assetId);
    const url = iconUrlFromAsset(asset);
    if (url) icons[providerId] = url;
  }

  return icons;
}
