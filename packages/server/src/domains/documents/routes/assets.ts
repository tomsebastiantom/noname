import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, deleted, notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { AssetBinaryStorage } from "../assets/binary";
import { processImage, sha256 } from "../assets/binary";
import type { AssetVariant, UploadAssetInput } from "../ports";
import type { DocumentsRouteDeps } from "./deps";
import { asString, parseFocalPoint, sanitizeName } from "./helpers";

export function registerAssetRoutes(
  routes: Hono,
  deps: DocumentsRouteDeps,
  assetBinary: AssetBinaryStorage,
): void {
  const { assets } = deps.service;

  routes.post("/assets/upload", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const form = await c.req.parseBody({ all: true });
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "missing 'file' field" }, 400);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const hash = sha256(bytes);

    const existing = await assets.findByHash(orgId, hash);
    if (existing) return ok(c, existing);

    const baseKey = `${orgId}/${hash}/${sanitizeName(file.name)}`;
    const focalPoint = parseFocalPoint(form.focalPoint);

    let variants: Record<string, AssetVariant>;
    let width: number | null = null;
    let height: number | null = null;

    if (mimeType.startsWith("image/")) {
      const result = await processImage(assetBinary, baseKey, bytes, mimeType, focalPoint);
      variants = result.variants;
      width = result.width;
      height = result.height;
    } else {
      const url = await assetBinary.put(baseKey, bytes, mimeType);
      variants = { original: { url, width: null, height: null } };
    }

    const input: UploadAssetInput = {
      fileName: file.name,
      mimeType,
      fileSizeBytes: bytes.length,
      storageKey: baseKey,
      width,
      height,
      altText: asString(form.altText) ?? null,
      caption: asString(form.caption) ?? null,
      focalPoint,
      variants,
      hash,
    };
    const createdAsset = await assets.create(orgId, input);
    return created(c, createdAsset);
  });

  routes.get("/assets", async (c) => {
    const orgId = getOrgId(c);
    return ok(c, await assets.list(orgId));
  });

  routes.get("/assets/:assetId", async (c) => {
    const orgId = getOrgId(c);
    const found = await assets.get(orgId, c.req.param("assetId"));
    return found ? ok(c, found) : notFound(c);
  });

  routes.put("/assets/:assetId", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<{
      altText?: string | null;
      caption?: string | null;
      focalPoint?: { x: number; y: number } | null;
    }>();
    const updated = await assets.update(orgId, c.req.param("assetId"), body);
    return ok(c, updated);
  });

  routes.delete("/assets/:assetId", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    await assets.delete(orgId, c.req.param("assetId"));
    return deleted(c);
  });

  routes.put("/assets/:assetId/publish", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_PUBLISH);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const published = await assets.publish(orgId, c.req.param("assetId"));
    return ok(c, published);
  });
}
