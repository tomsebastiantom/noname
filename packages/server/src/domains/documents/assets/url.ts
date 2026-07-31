export function assetPublicBaseUrl(): string {
  return process.env.ASSET_PUBLIC_BASE_URL || "https://assets.noname.dev";
}

export function urlFromStorageKey(storageKey: string): string {
  return `${assetPublicBaseUrl()}/${storageKey}`;
}
