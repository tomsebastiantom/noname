import Redis from "ioredis";
import { getRedisConnection } from "../../../shared/redis";
import type { CatalogManifest, CatalogManifestRemote } from "../ports";
import type { BuildStatus, ManifestStore } from "./manifest-store";

const MANIFEST_PREFIX = "tenant:manifest:";
const BUILD_PREFIX = "tenant:build:";
const BUILD_TTL_SEC = 86_400;

export function createRedisManifestStore(): ManifestStore {
  const redis = new Redis(getRedisConnection());

  return {
    async get(orgId) {
      const raw = await redis.get(`${MANIFEST_PREFIX}${orgId}`);
      if (!raw) return null;
      return JSON.parse(raw) as CatalogManifest;
    },
    async set(orgId, manifest) {
      await redis.set(`${MANIFEST_PREFIX}${orgId}`, JSON.stringify(manifest));
    },
    async addComponent(orgId, entry: CatalogManifestRemote) {
      const existing = await redis.get(`${MANIFEST_PREFIX}${orgId}`);
      const manifest: CatalogManifest = existing
        ? (JSON.parse(existing) as CatalogManifest)
        : { platform: { version: "1", hash: "init" }, extensions: [] };
      manifest.private = entry;
      await redis.set(`${MANIFEST_PREFIX}${orgId}`, JSON.stringify(manifest));
    },
    async removeComponent(orgId, _name) {
      const raw = await redis.get(`${MANIFEST_PREFIX}${orgId}`);
      if (!raw) return;
      const manifest = JSON.parse(raw) as CatalogManifest;
      manifest.private = undefined;
      await redis.set(`${MANIFEST_PREFIX}${orgId}`, JSON.stringify(manifest));
    },
    async setBuildStatus(buildId, status, result) {
      const payload: BuildStatus = { status, result };
      await redis.set(`${BUILD_PREFIX}${buildId}`, JSON.stringify(payload), "EX", BUILD_TTL_SEC);
    },
    async getBuildStatus(buildId) {
      const raw = await redis.get(`${BUILD_PREFIX}${buildId}`);
      if (!raw) return null;
      return JSON.parse(raw) as BuildStatus;
    },
  };
}
