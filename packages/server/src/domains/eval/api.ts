import { PERMISSIONS } from "@noname/auth";
import type { AssertionConfig } from "@noname/eval";
import { Hono } from "hono";
import { z } from "zod";
import { getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { recordEvalReuse } from "../../shared/metrics";
import { getOrgId } from "../../shared/org";
import { ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { CapabilityRegistry } from "../capabilities/registry";
import type { EvidenceService } from "../evidence/ports";
import type { TenantCatalogService } from "../tenant/ports";
import { recordGateDecision } from "./gate";
import type { EvalJobData } from "./job";
import type { EvalResultStore } from "./results";

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
    reused: z.boolean().optional(),
    counts: z.object({
      pass: z.number().int().min(0),
      fail: z.number().int().min(0),
      skip: z.number().int().min(0),
      unverified: z.number().int().min(0),
      flaky: z.number().int().min(0).optional(),
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
  mode: z.enum(["gate", "sweep"]).optional(),
  releaseId: z.string().optional(),
  platformVersion: z.string().optional(),
  browserFleetVersion: z.string().optional(),
  sampleLimit: z.number().int().min(0).optional(),
});

export type EvalRoleContext = {
  /** role key → permissions that role grants. A map, not a union: audience coverage must be per role. */
  roles: Record<string, string[]>;
};

const reuseSchema = z.object({
  reused: z.number().int().min(0),
  computed: z.number().int().min(0),
  gate: z.boolean().optional(),
});

export function createEvalRoutes(deps: {
  capabilities: CapabilityRegistry;
  tenants: Pick<TenantCatalogService, "getManifest">;
  evidence: EvidenceService;
  /** Reads the org's roles from the identity provider. Null means unavailable, never “no roles”. */
  listRoles?: (orgId: string) => Promise<EvalRoleContext | null>;
  /** Content-addressed result store. Absent → cache endpoints are unavailable. */
  results?: EvalResultStore;
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

    let roleContext: EvalRoleContext | null = null;
    if (deps.listRoles) {
      try {
        roleContext = await deps.listRoles(orgId);
      } catch {
        roleContext = null;
      }
    }

    return ok(c, {
      capabilities,
      extensions: manifest.extensions ?? [],
      roles: roleContext?.roles ?? null,
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
      mode: parsed.data.mode,
      releaseId: parsed.data.releaseId,
      platformVersion: parsed.data.platformVersion,
      browserFleetVersion: parsed.data.browserFleetVersion,
      sampleLimit: parsed.data.sampleLimit,
    });

    return ok(c, { jobId: job.id });
  });

  routes.get("/results/:key", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;
    if (!deps.results) return c.json({ error: "Eval result store unavailable" }, 503);

    const key = c.req.param("key");
    if (!/^[a-f0-9]{64}$/.test(key)) return c.json({ error: "Invalid cache key" }, 400);

    return ok(c, { result: await deps.results.get(key) });
  });

  routes.put("/results/:key", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;
    if (!deps.results) return c.json({ error: "Eval result store unavailable" }, 503);

    const key = c.req.param("key");
    if (!/^[a-f0-9]{64}$/.test(key)) return c.json({ error: "Invalid cache key" }, 400);

    const body = (await c.req.json().catch(() => null)) as {
      passed?: unknown;
      counts?: { fail?: unknown; unverified?: unknown };
    } | null;
    const cleanPass =
      body?.passed === true && body.counts?.fail === 0 && body.counts?.unverified === 0;
    if (!cleanPass) {
      // Defence in depth: the CLI already refuses, but the store must never hold a failure or an unverified run.
      return c.json({ error: "Only clean passes may be cached" }, 400);
    }

    await deps.results.put(key, body);
    return ok(c, { stored: true });
  });

  routes.get("/checks/:key", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;
    if (!deps.results) return c.json({ error: "Eval result store unavailable" }, 503);

    const key = c.req.param("key");
    if (key.length > 300) return c.json({ error: "Invalid cache key" }, 400);
    return ok(c, { results: await deps.results.get(key) });
  });

  routes.put("/checks/:key", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;
    if (!deps.results) return c.json({ error: "Eval result store unavailable" }, 503);

    const key = c.req.param("key");
    if (key.length > 300) return c.json({ error: "Invalid cache key" }, 400);

    const body = (await c.req.json().catch(() => null)) as unknown;
    const results = Array.isArray(body) ? body : null;
    const allPass =
      results !== null &&
      results.length > 0 &&
      results.every(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { status?: unknown }).status === "pass" &&
          (entry as { id?: unknown }).id !== "B5.behaviour",
      );
    if (!allPass) return c.json({ error: "Only passing read-only results may be cached" }, 400);

    await deps.results.put(key, results);
    return ok(c, { stored: true });
  });

  routes.post("/reuse", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;

    const parsed = reuseSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid reuse report" }, 400);

    recordEvalReuse(parsed.data);
    return ok(c, { recorded: true });
  });

  return routes;
}
