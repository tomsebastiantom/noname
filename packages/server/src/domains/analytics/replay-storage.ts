import { gunzipSync } from "node:zlib";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createR2AssetStorage, type R2Config, r2ConfigFromEnv } from "../documents/contracts";
import { isGzipBuffer, replayChunkExtension } from "./replay-ingest";

export interface ReplayBlobStorage {
  putChunk(
    orgId: string,
    sessionId: string,
    chunkId: string,
    body: Buffer,
    gzip: boolean,
  ): Promise<string>;
  getChunk(storageKey: string): Promise<string | null>;
}

function createS3Client(cfg: R2Config): S3Client {
  const isLocal = /localhost|127\.0\.0\.1/.test(cfg.endpoint);
  let region = cfg.region;
  if (region == null) {
    region = isLocal ? "us-east-1" : "auto";
  }
  return new S3Client({
    region,
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
    async putChunk(orgId, sessionId, chunkId, body, gzip) {
      const ext = replayChunkExtension(gzip);
      const key = `replays/${orgId}/${sessionId}/${chunkId}${ext}`;
      const mimeType = gzip ? "application/gzip" : "application/json";
      await assets.put(key, body, mimeType);
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
        const raw = Buffer.from(await res.Body.transformToByteArray());
        if (storageKey.endsWith(".json.gz") || isGzipBuffer(raw)) {
          return gunzipSync(raw).toString("utf8");
        }
        return raw.toString("utf8");
      } catch {
        return null;
      }
    },
  };
}
