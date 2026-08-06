import type { Chunk, StorageKey } from "@automerge/automerge-repo/slim";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { type R2Config, r2ConfigFromEnv } from "../documents/assets/r2";
import {
  automergeStorageKeyMatchesPrefix,
  decodeAutomergeStorageKey,
  encodeAutomergeStorageKey,
} from "./automerge-storage-key";
import type { CollabAutomergeChunkStore } from "./collab-automerge-chunk-store";

const KEY_PREFIX = "collab-automerge";

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

function objectPrefix(orgId: string, layoutDocumentId: string): string {
  return `${KEY_PREFIX}/${orgId}/${layoutDocumentId}/`;
}

function objectKey(orgId: string, layoutDocumentId: string, storageKey: string): string {
  return `${objectPrefix(orgId, layoutDocumentId)}${storageKey}`;
}

async function bodyToUint8Array(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new Error("unexpected R2 object body");
}

export function createR2CollabAutomergeChunkStore(
  config?: R2Config,
): CollabAutomergeChunkStore | null {
  const cfg = config ?? r2ConfigFromEnv();
  if (!cfg) return null;

  const client = createS3Client(cfg);
  const bucket = cfg.bucket;

  return {
    async load(orgId, layoutDocumentId, key) {
      const encoded = encodeAutomergeStorageKey(key);
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey(orgId, layoutDocumentId, encoded),
          }),
        );
        if (!response.Body) return undefined;
        return bodyToUint8Array(response.Body);
      } catch {
        return undefined;
      }
    },

    async save(orgId, layoutDocumentId, key, data) {
      const encoded = encodeAutomergeStorageKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(orgId, layoutDocumentId, encoded),
          Body: Buffer.from(data),
          ContentType: "application/octet-stream",
        }),
      );
    },

    async remove(orgId, layoutDocumentId, key) {
      const encoded = encodeAutomergeStorageKey(key);
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: objectKey(orgId, layoutDocumentId, encoded),
        }),
      );
    },

    async loadRange(orgId, layoutDocumentId, keyPrefix) {
      const prefix = encodeAutomergeStorageKey(keyPrefix);
      const listPrefix = prefix
        ? `${objectPrefix(orgId, layoutDocumentId)}${prefix}`
        : objectPrefix(orgId, layoutDocumentId);

      const chunks: Chunk[] = [];
      let continuationToken: string | undefined;

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: listPrefix,
            ContinuationToken: continuationToken,
          }),
        );

        for (const item of response.Contents ?? []) {
          if (!item.Key) continue;
          const storageKey = item.Key.slice(objectPrefix(orgId, layoutDocumentId).length);
          if (!automergeStorageKeyMatchesPrefix(storageKey, keyPrefix)) continue;

          const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.Key }));
          if (!object.Body) continue;
          chunks.push({
            key: decodeAutomergeStorageKey(storageKey),
            data: await bodyToUint8Array(object.Body),
          });
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);

      return chunks;
    },

    async removeRange(orgId, layoutDocumentId, keyPrefix) {
      const matches = await this.loadRange(orgId, layoutDocumentId, keyPrefix);
      for (const chunk of matches) {
        await this.remove(orgId, layoutDocumentId, chunk.key as StorageKey);
      }
    },
  };
}
