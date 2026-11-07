import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { getOrgId, getUserId } from "../../shared/org";
import { created, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { ReleaseArtifactKind, ReleaseService } from "./ports";

const ARTIFACT_KINDS = [
  "client_bundle",
  "server_image",
  "worker_image",
  "migration_set",
  "config",
] as const satisfies readonly ReleaseArtifactKind[];

const artifactSchema = z.object({
  kind: z.enum(ARTIFACT_KINDS),
  ref: z.string().min(1),
  digest: z.string().min(8),
});

const createReleaseSchema = z.object({
  platformVersion: z.string().min(1),
  checksVersion: z.string().min(1),
  artifacts: z.array(artifactSchema).min(1),
});

/**
 * Release endpoints are thin on purpose: validation lives in the service, the record is immutable, and the
 * only mutation exposed here is `building → ready`. Promotion and pointers arrive with later blocks.
 */
export function createReleaseRoutes(service: ReleaseService) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;

    const parsed = createReleaseSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid release", details: parsed.error.flatten() }, 400);
    }

    const release = await service.create(
      getOrgId(c),
      parsed.data,
      getUserId(c)?.trim() || "system",
    );
    return created(c, release);
  });

  routes.get("/", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_READ);
    if (denied) return denied;
    return ok(c, await service.list(getOrgId(c)));
  });

  routes.post("/:id/ready", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    return ok(c, await service.markReady(getOrgId(c), c.req.param("id")));
  });

  routes.get("/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_READ);
    if (denied) return denied;
    return ok(c, await service.get(getOrgId(c), c.req.param("id")));
  });

  return routes;
}
