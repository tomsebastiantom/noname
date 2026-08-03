import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AssetBinaryStorage } from "./binary";

// Cloudflare R2 is S3-compatible, so this adapter talks the S3 API. Point it
// at real R2 by setting R2_ACCOUNT_ID + the R2 creds. For LOCAL dev, point
// it at an s3rver container (same S3 API) — no code change, just env:
//
//   R2_ENDPOINT=http://localhost:9000   # s3rver, not R2
//   R2_BUCKET=noname-assets
//   R2_ACCESS_KEY_ID=dummy
//   R2_SECRET_ACCESS_KEY=dummy
//   R2_PUBLIC_URL=http://localhost:9000/noname-assets
//   R2_REGION=us-east-1
//
// The adapter auto-detects "localhost/127.0.0.1" endpoints and switches to
// path-style addressing (what s3rver expects) — exactly what R2's real endpoint
// does not need.

export interface R2Config {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
  region?: string;
}

export function r2ConfigFromEnv(): R2Config | null {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) return null;

  const endpoint =
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : null);
  if (!endpoint) return null;

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicUrl: process.env.R2_PUBLIC_URL,
    region: process.env.R2_REGION,
  };
}

export function createR2AssetStorage(config?: R2Config): AssetBinaryStorage {
  const cfg = config ?? r2ConfigFromEnv();
  if (!cfg)
    throw new Error(
      "R2 asset storage requires R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
  const store = cfg;

  const isLocal = /localhost|127\.0\.0\.1/.test(store.endpoint);
  let region = cfg.region;
  if (region == null) {
    region = isLocal ? "us-east-1" : "auto";
  }

  const client = new S3Client({
    region,
    endpoint: store.endpoint,
    credentials: {
      accessKeyId: store.accessKeyId,
      secretAccessKey: store.secretAccessKey,
    },
    forcePathStyle: isLocal,
  });

  const publicBase = store.publicUrl || `${store.endpoint.replace(/\/$/, "")}/${store.bucket}`;

  async function putObject(key: string, bytes: Buffer, contentType: string): Promise<string> {
    await client.send(
      new PutObjectCommand({
        Bucket: store.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }

  return {
    put(storageKey, bytes, mimeType) {
      return putObject(storageKey, bytes, mimeType);
    },
    putVariant(storageKey, bytes, mimeType) {
      return putObject(storageKey, bytes, mimeType);
    },
  };
}
