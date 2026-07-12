export interface CatalogManifestRemote {
  name: string;
  url: string;
  hash: string;
  version: number;
}

export interface CatalogManifest {
  platform: { version: string; hash: string };
  private?: CatalogManifestRemote;
  marketplace?: CatalogManifestRemote[];
}

export interface BuildStatus {
  status: "pending" | "running" | "completed" | "failed";
  result?: {
    remoteEntry?: { filename: string; url: string };
    hash?: string;
    error?: string;
  };
}

export interface TenantCatalogService {
  getManifest(tenantId: string): Promise<CatalogManifest>;
  /** Enqueue a catalog build job. Returns the build ID for status polling. */
  publishComponent(tenantId: string, name: string, source: string): Promise<{ buildId: string }>;
  /** Check the status of a catalog build. */
  getBuildStatus(tenantId: string, buildId: string): Promise<BuildStatus | null>;
  removeComponent(tenantId: string, name: string): Promise<void>;
}
