import { ValidationError } from "../../../shared/domain-error";
import type { AssetDTO } from "../ports";
import { urlFromStorageKey } from "./url";

export function validateAssetMime(mimeType: string): void {
  if (!/^(image|video|application)\//.test(mimeType)) {
    throw new ValidationError("mimeType", `unsupported asset mime type '${mimeType}'`);
  }
}

function buildEnrichedOriginal(
  original: { url?: string; width?: number | null; height?: number | null } | undefined,
  originalUrl: string | undefined,
): { url?: string; width?: number | null; height?: number | null } | undefined {
  if (original) {
    return { ...original, url: originalUrl ?? original.url };
  }
  if (originalUrl) {
    return { url: originalUrl, width: null, height: null };
  }
  return undefined;
}

export function enrichAssetUrls(dto: AssetDTO): AssetDTO {
  const storageKey = typeof dto.data.storageKey === "string" ? dto.data.storageKey : null;
  const original = dto.data.original as
    | { url?: string; width?: number | null; height?: number | null }
    | undefined;
  const originalUrl = storageKey ? urlFromStorageKey(storageKey) : original?.url;

  const variants =
    (dto.data.variants as Record<
      string,
      { url: string; width: number | null; height: number | null; format?: string }
    >) ?? {};
  const resolved: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(variants)) {
    resolved[name] = {
      url: v.url,
      width: v.width ?? null,
      height: v.height ?? null,
      format: v.format ?? null,
    };
  }
  return {
    ...dto,
    data: {
      ...dto.data,
      original: buildEnrichedOriginal(original, originalUrl),
      _resolved: resolved,
    },
  };
}
