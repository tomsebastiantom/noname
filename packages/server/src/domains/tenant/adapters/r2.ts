import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { type R2Config, r2ConfigFromEnv } from "../../documents/contracts";

export { type R2Config, r2ConfigFromEnv } from "../../documents/contracts";

export interface CatalogBundleStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<string>;
  publicUrl(key: string): string;
}

export function createCatalogBundleStorage(config?: R2Config): CatalogBundleStorage {
  const cfg = config ?? r2ConfigFromEnv();
  if (!cfg) {
    throw new Error(
      "Catalog bundle storage requires R2 config. Set R2_BUCKET, R2_ENDPOINT, " +
        "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(cfg.endpoint);
  let region = cfg.region;
  if (region == null) {
    region = isLocal ? "us-east-1" : "auto";
  }

  const client = new S3Client({
    region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: isLocal,
  });

  const publicBase = cfg.publicUrl || `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}`;

  return {
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
      return `${publicBase.replace(/\/$/, "")}/${key}`;
    },
    publicUrl(key) {
      return `${publicBase.replace(/\/$/, "")}/${key}`;
    },
  };
}
