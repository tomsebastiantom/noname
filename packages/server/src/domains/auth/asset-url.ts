import { iconUrlFromAsset } from "../documents/contracts";
import type { AssetDocumentService, MediaRef } from "../documents/ports";

export { iconUrlFromAsset };

/** Resolve stored media refs to public icon URLs for GET /auth/config. */
export async function resolveProviderIconUrls(
  orgId: string,
  providers: string[],
  iconAssets: Record<string, MediaRef>,
  assets: AssetDocumentService,
): Promise<Record<string, string>> {
  const icons: Record<string, string> = {};

  for (const providerId of providers) {
    const documentId = iconAssets[providerId]?.documentId?.trim();
    if (!documentId) continue;
    const asset = await assets.get(orgId, documentId);
    const url = iconUrlFromAsset(asset);
    if (url) icons[providerId] = url;
  }

  return icons;
}
