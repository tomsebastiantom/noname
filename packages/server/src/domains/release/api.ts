import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { getOrgId, getUserId } from "../../shared/org";
import { created, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type {
  ChannelService,
  EnvironmentService,
  ReleaseArtifactKind,
  ReleasePointerService,
  ReleaseRetention,
  ReleaseService,
} from "./ports";

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

const activateSchema = z.object({
  environment: z.string().min(1).default("production"),
});

const pruneSchema = z.object({
  keep: z.number().int().min(1).max(50).default(3),
});

const channelActivateSchema = z.object({
  releaseId: z.string().min(1),
});

const channelAssignSchema = z.object({
  channel: z.string().min(1),
});

/**
 * Release endpoints are thin on purpose: validation lives in the service, the record is immutable, and the
 * only mutations are `building → ready` and the environment selector (D15).
 */
export function createReleaseRoutes(
  service: ReleaseService,
  environments: EnvironmentService,
  channels: ChannelService,
  pointer: ReleasePointerService,
  retention: ReleaseRetention,
) {
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

  routes.post("/prune", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    const parsed = pruneSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Invalid prune request", details: parsed.error.flatten() }, 400);
    }
    return ok(c, await retention.prune(getOrgId(c), parsed.data.keep));
  });

  routes.get("/pointer", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_READ);
    if (denied) return denied;
    return ok(c, await pointer.get(getOrgId(c)));
  });

  routes.post("/pointer/rollback", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    return ok(c, await pointer.rollback(getOrgId(c), getUserId(c)?.trim() || "system"));
  });

  routes.post("/pointer/channel", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    const parsed = channelAssignSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid channel assignment" }, 400);
    return ok(
      c,
      await pointer.assignChannel(
        getOrgId(c),
        parsed.data.channel,
        getUserId(c)?.trim() || "system",
      ),
    );
  });

  routes.delete("/pointer/channel", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    return ok(c, await pointer.clearChannel(getOrgId(c), getUserId(c)?.trim() || "system"));
  });

  routes.get("/channels", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_READ);
    if (denied) return denied;
    return ok(c, await channels.list(getOrgId(c)));
  });

  routes.post("/channels/:channel/activate", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    const parsed = channelActivateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid channel activation" }, 400);
    return ok(
      c,
      await channels.activate(
        getOrgId(c),
        c.req.param("channel"),
        parsed.data.releaseId,
        getUserId(c)?.trim() || "system",
      ),
    );
  });

  routes.post("/channels/:channel/rollback", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    return ok(
      c,
      await channels.rollback(
        getOrgId(c),
        c.req.param("channel"),
        getUserId(c)?.trim() || "system",
      ),
    );
  });

  routes.get("/environments", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_READ);
    if (denied) return denied;
    return ok(c, await environments.list(getOrgId(c)));
  });

  routes.post("/environments/:name/rollback", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    return ok(
      c,
      await environments.rollback(
        getOrgId(c),
        c.req.param("name"),
        getUserId(c)?.trim() || "system",
      ),
    );
  });

  routes.post("/:id/preview", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    return ok(
      c,
      await environments.preview(getOrgId(c), c.req.param("id"), getUserId(c)?.trim() || "system"),
    );
  });

  routes.post("/:id/activate", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    const parsed = activateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Invalid activation", details: parsed.error.flatten() }, 400);
    }
    return ok(
      c,
      await environments.activate(
        getOrgId(c),
        c.req.param("id"),
        parsed.data.environment,
        getUserId(c)?.trim() || "system",
      ),
    );
  });

  routes.post("/:id/promote", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.RELEASES_WRITE);
    if (denied) return denied;
    return ok(
      c,
      await pointer.promote(getOrgId(c), c.req.param("id"), getUserId(c)?.trim() || "system"),
    );
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
