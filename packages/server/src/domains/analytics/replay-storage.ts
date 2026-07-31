import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createR2AssetStorage, type R2Config, r2ConfigFromEnv } from "../documents/contracts";

export interface ReplayBlobStorage {
  putChunk(orgId: string, sessionId: string, chunkId: string, json: string): Promise<string>;
  getChunk(storageKey: string): Promise<string | null>;
}

function createS3Client(cfg: R2Config): S3Client {
  const isLocal = /localhost|127\.0\.0\.1/.test(cfg.endpoint);
  return new S3Client({
    region: cfg.region ?? (isLocal ? "us-east-1" : "auto"),
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: isLocal,
  });
}

/** S3/R2 blob store for rrweb chunks — same docker s3rver / prod R2 as assets. */
export function createReplayBlobStorage(): ReplayBlobStorage | null {
  const cfg = r2ConfigFromEnv();
  if (!cfg) return null;

  const assets = createR2AssetStorage(cfg);
  const client = createS3Client(cfg);

  return {
    async putChunk(orgId, sessionId, chunkId, json) {
      const key = `replays/${orgId}/${sessionId}/${chunkId}.json`;
      await assets.put(key, Buffer.from(json, "utf8"), "application/json");
      return key;
    },

    async getChunk(storageKey) {
      try {
        const res = await client.send(
          new GetObjectCommand({
            Bucket: cfg.bucket,
            Key: storageKey,
          }),
        );
        if (!res.Body) return null;
        return await res.Body.transformToString("utf8");
      } catch {
        return null;
      }
    },
  };
}
