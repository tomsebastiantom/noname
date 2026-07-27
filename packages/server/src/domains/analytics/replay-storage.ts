import { createR2AssetStorage, r2ConfigFromEnv } from "../documents/assets/r2";

export interface ReplayBlobStorage {
  putChunk(orgId: string, sessionId: string, chunkId: string, json: string): Promise<string>;
}

/** S3/R2 blob store for rrweb chunks — same docker s3rver / prod R2 as assets. */
export function createReplayBlobStorage(): ReplayBlobStorage | null {
  const cfg = r2ConfigFromEnv();
  if (!cfg) return null;

  const assets = createR2AssetStorage(cfg);

  return {
    async putChunk(orgId, sessionId, chunkId, json) {
      const key = `replays/${orgId}/${sessionId}/${chunkId}.json`;
      await assets.put(key, Buffer.from(json, "utf8"), "application/json");
      return key;
    },
  };
}
