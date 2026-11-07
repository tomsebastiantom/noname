import { PERMISSIONS } from "@noname/auth";
import type { AssertionConfig } from "@noname/eval";
import { Hono } from "hono";
import { z } from "zod";
import { getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getOrgId } from "../../shared/org";
import { ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { CapabilityRegistry } from "../capabilities/registry";
import type { EvidenceService } from "../evidence/ports";
import type { TenantCatalogService } from "../tenant/ports";
import { recordGateDecision } from "./gate";
import type { EvalJobData } from "./job";

/**
 * Machine-only eval endpoints.
 *
 * `/context` exposes what a check cannot import (capability registry, installed extensions).
 * `/record` is the gate sink: the CLI posts a completed run, the server writes exactly one Evidence decision
 * and records metrics. Evidence writes stay server-side — the audit kernel has one writer path.
 */
const gateResultSchema = z.object({
  tenantSlug: z.string().min(1),
  result: z.object({
    runId: z.string().min(1),
    checksVersion: z.string().min(1),
    passed: z.boolean(),
    counts: z.object({
      pass: z.number().int().min(0),
      fail: z.number().int().min(0),
      skip: z.number().int().min(0),
      unverified: z.number().int().min(0),
    }),
    checks: z
      .array(
        z.object({
          id: z.string().min(1),
          status: z.enum(["pass", "fail", "skip"]),
          level: z.enum(["warn", "error"]),
          subject: z.string().optional(),
        }),
      )
      .max(1000),
  }),
});

const runRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  config: z.unknown().optional(),
});

export function createEvalRoutes(deps: {
  capabilities: CapabilityRegistry;
  tenants: Pick<TenantCatalogService, "getManifest">;
  evidence: EvidenceService;
}) {
  const routes = new Hono();

  routes.get("/context", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;

    const orgId = getOrgId(c);
    const manifest = await deps.tenants.getManifest(orgId);
    const capabilities = deps.capabilities.names().map((name) => {
      const definition = deps.capabilities.definition(name);
      return {
        name,
        permission: definition?.permission ?? null,
        extension: definition?.extension ?? null,
        publicAccess: definition?.publicAccess ?? null,
      };
    });

    return ok(c, {
      capabilities,
      extensions: manifest.extensions ?? [],
    });
  });

  routes.post("/record", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;

    const body = await c.req.json().catch(() => null);
    const parsed = gateResultSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid eval result" }, 400);
    }

    const decision = await recordGateDecision(deps.evidence, {
      orgId: getOrgId(c),
      tenantSlug: parsed.data.tenantSlug,
      result: parsed.data.result,
    });

    return ok(c, decision);
  });

  routes.post("/runs", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;

    const body = await c.req.json().catch(() => null);
    const parsed = runRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid eval job" }, 400);
    }

    const queue = getBullmqQueue<EvalJobData>(BULLMQ_QUEUES.EVAL);
    const job = await queue.add("eval.run", {
      orgId: getOrgId(c),
      tenantSlug: parsed.data.tenantSlug,
      config: parsed.data.config as AssertionConfig | undefined,
    });

    return ok(c, { jobId: job.id });
  });

  return routes;
}
