import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { getOrgId, getUserId } from "../../shared/org";
import { created, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import { assertMigrationsPromotable } from "./migration-policy";
import { requirePlatformOperator } from "./platform-guard";
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

const rolloutSchema = z.object({
  orgIds: z.array(z.string().min(1)).min(1).max(100),
  dryRun: z.boolean().optional().default(true),
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
  options: {
    selectability?: (orgId: string) => Promise<
      | { selectable: true }
      | {
          selectable: false;
          reason:
            | "unknown_tenant"
            | "tenant_suspended"
            | "tenant_offboarding"
            | "tenant_excluded"
            | "tenant_not_ready"
            | "platform_org";
        }
    >;
    verdict?: (input: {
      orgId: string;
      checksVersion?: string | null;
    }) => Promise<{ status: "pass" | "block" | "unverified" | "missing"; reason?: string }>;
  } = {},
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

  /**
   * Wave rollout.
   *
   * `dryRun` (default) returns the plan and writes nothing. `dryRun: false` promotes every **eligible** org and
   * reports per-org results; a failure on one org never rolls back the others — partial failure is reported, not
   * hidden. Attribution comes from the pointer service, which writes one audit row per move.
   */
  routes.post("/:id/rollout", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;

    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const parsed = rolloutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid rollout", details: parsed.error.flatten() }, 400);
    }

    const platformOrg = process.env.PLATFORM_ORG_ID?.trim();
    if (!platformOrg) return c.json({ error: "Platform operator is not configured" }, 503);

    const release = await service.getAnyOrg(c.req.param("id"));
    if (release.orgId !== platformOrg) {
      return c.json({ error: "A platform release is required for a rollout" }, 409);
    }
    if (release.state !== "ready") {
      return c.json({ error: `Release ${release.id} is ${release.state}` }, 409);
    }
    assertMigrationsPromotable(release);

    const dryRun = parsed.data.dryRun !== false;
    const orgIds = [...new Set(parsed.data.orgIds)];
    const results: Array<{
      orgId: string;
      status: "eligible" | "skipped" | "promoted" | "failed";
      reason?: string;
      error?: string;
    }> = [];
    for (const orgId of orgIds) {
      if (orgId === platformOrg) {
        results.push({ orgId, status: "skipped", reason: "platform_org" });
        continue;
      }
      // Fail closed: an org the directory does not know, or one it excludes, is never eligible. Without this a
      // typo'd id (or a suspended tenant) was reported as eligible and would have been written on the real path.
      if (options.selectability) {
        const verdict = await options.selectability(orgId);
        if (!verdict.selectable) {
          results.push({ orgId, status: "skipped", reason: verdict.reason });
          continue;
        }
      }
      const currentPointer = await pointer.get(orgId);
      if (currentPointer?.releaseId === release.id) {
        results.push({ orgId, status: "skipped", reason: "already_on_release" });
        continue;
      }
      // Verdict before promotion: a tenant whose own gate did not pass is never eligible. `missing` is skipped
      // too — "we have no decision" is not evidence that the tenant is safe to move.
      if (options.verdict) {
        const verdict = await options.verdict({
          orgId,
          checksVersion: release.checksVersion ?? null,
        });
        if (verdict.status !== "pass") {
          const reason =
            verdict.status === "missing"
              ? "no_verdict"
              : verdict.status === "block"
                ? "verdict_blocked"
                : "verdict_unverified";
          results.push({ orgId, status: "skipped", reason });
          continue;
        }
      }
      results.push({ orgId, status: dryRun ? "eligible" : "promoted" });
      if (dryRun) continue;

      // Real promotion. `pointer.promote` writes the pointer and one audit row per org; a throw here is that
      // org's failure only, so the rest of the wave still runs.
      try {
        await pointer.promote(orgId, release.id, operator.userId, { platformOrgId: platformOrg, actorType: "service" });
      } catch (cause) {
        const last = results.at(-1);
        if (last) {
          last.status = "failed";
          last.error = cause instanceof Error ? cause.message : String(cause);
        }
      }
    }

    const summary = {
      promoted: results.filter((row) => row.status === "promoted").length,
      failed: results.filter((row) => row.status === "failed").length,
      skipped: results.filter((row) => row.status === "skipped").length,
      eligible: results.filter((row) => row.status === "eligible").length,
    };

    return ok(c, { releaseId: release.id, dryRun, summary, results });
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
