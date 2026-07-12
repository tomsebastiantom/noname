export interface EdgeContext {
  tenantId: string;
  userId: string;
  role: string;
  segment?: string;
}

export interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  API_ORIGIN: string;
  LOGTO_ENDPOINT: string;
}
