import { createHash } from "node:crypto";
import { ServiceUnavailableError } from "../../../shared/domain-error";
import type { AssetVariant } from "../ports";
import { createR2AssetStorage, r2ConfigFromEnv } from "./r2";

// The documents domain only depends on this port, never on a concrete bucket.
export interface AssetBinaryStorage {
  put(storageKey: string, bytes: Buffer, mimeType: string): Promise<string>;
  putVariant(storageKey: string, bytes: Buffer, mimeType: string): Promise<string>;
}
// staging/prod point at Cloudflare R2. The domain only depends on the
// AssetBinaryStorage port — there is no on-disk fallback anymore.
export function createAssetStorage(): AssetBinaryStorage {
  const cfg = r2ConfigFromEnv();
  if (!cfg) {
    throw new ServiceUnavailableError(
      "Asset storage requires R2/S3 config. For local dev run s3rver " +
        "(docker compose up) and set R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL. For prod use Cloudflare R2 values.",
    );
  }
  return createR2AssetStorage(cfg);
}

// Optional sharp-based image variant generation. Sharp is loaded lazily so the
// domain builds and runs without it; when installed, real responsive variants
// (thumbnail/small/medium/large) are produced. Falls back to the original URL
// when sharp is unavailable.
const IMAGE_SIZES = [
  { name: "thumbnail", width: 150 },
  { name: "small", width: 480 },
  { name: "medium", width: 960 },
  { name: "large", width: 1920 },
] as const;

export async function processImage(
  storage: AssetBinaryStorage,
  baseKey: string,
  bytes: Buffer,
  mimeType: string,
  focalPoint?: { x: number; y: number } | null,
): Promise<{
  variants: Record<string, AssetVariant>;
  width: number | null;
  height: number | null;
}> {
  const originalUrl = await storage.put(baseKey, bytes, mimeType);
  const variants: Record<string, AssetVariant> = {
    original: { url: originalUrl, width: null, height: null },
  };

  const sharpMod = await loadSharp();
  if (!sharpMod) {
    for (const s of IMAGE_SIZES) {
      variants[s.name] = { url: originalUrl, width: null, height: null };
    }
    return { variants, width: null, height: null };
  }

  try {
    const image = sharpMod.default(bytes);
    const meta = await image.metadata();
    const width = meta.width ?? null;
    const height = meta.height ?? null;

    const sharpModRef = sharpMod;

    for (const s of IMAGE_SIZES) {
      const resized = await resizeWithSharp(sharpModRef, bytes, s.width, focalPoint);
      const variantKey = `${baseKey}__${s.name}`;
      const url = await storage.putVariant(variantKey, resized, mimeType);
      variants[s.name] = { url, width: s.width, height: null };
    }

    const srcMime = mimeType || "image/png";
    if (srcMime !== "image/svg+xml" && srcMime !== "image/gif") {
      for (const s of IMAGE_SIZES) {
        const buf = await resizeWithSharp(sharpModRef, bytes, s.width, focalPoint);

        const webpBuf = await sharpModRef.default(buf).webp().toBuffer();
        const webpKey = `${baseKey}__${s.name}__webp`;
        const webpUrl = await storage.putVariant(webpKey, webpBuf, "image/webp");
        variants[`${s.name}_webp`] = { url: webpUrl, width: s.width, height: null, format: "webp" };

        const avifBuf = await sharpModRef.default(buf).avif().toBuffer();
        const avifKey = `${baseKey}__${s.name}__avif`;
        const avifUrl = await storage.putVariant(avifKey, avifBuf, "image/avif");
        variants[`${s.name}_avif`] = { url: avifUrl, width: s.width, height: null, format: "avif" };
      }
    }

    return { variants, width, height };
  } catch {
    for (const s of IMAGE_SIZES) {
      variants[s.name] = { url: originalUrl, width: null, height: null };
    }
    return { variants, width: null, height: null };
  }
}

async function resizeWithSharp(
  sharpMod: { default: (input: Buffer) => any },
  bytes: Buffer,
  width: number,
  focalPoint?: { x: number; y: number } | null,
): Promise<Buffer> {
  const pipeline = sharpMod.default(bytes).resize({ width });
  if (focalPoint) {
    pipeline.resize({ width, fit: "cover", position: "entropy" });
  }
  return pipeline.toBuffer();
}

async function loadSharp(): Promise<{ default: (input: Buffer) => any } | null> {
  try {
    const mod = await import("sharp");
    return mod as unknown as { default: (input: Buffer) => any };
  } catch {
    return null;
  }
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
