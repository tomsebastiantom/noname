import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../../shared/respond";
import type { EvidenceService } from "../evidence/ports";
import { requirePlatformOperator } from "../release/platform-guard";
import {
  CREDENTIAL_ACTIONS,
  CREDENTIAL_SUBJECT_TYPE,
  type CredentialAction,
  type CredentialEventInput,
} from "./actions";
import { type CredentialGrant, readRecordedGrants, reconcileGrants } from "./service";

const eventSchema = z.object({
  action: z.enum(
    Object.values(CREDENTIAL_ACTIONS) as [CredentialAction, ...CredentialAction[]],
  ),
  /** Tenant scope for a tenant-owned credential; omit for platform scope. */
  orgId: z.string().min(1).optional(),
  accountId: z.string().min(1),
  accountName: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  keyId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  /**
   * `system` is the only actor a caller may claim, and only to mark a **bootstrap** change: the very first
   * provisioning run creates the credential that would otherwise attest it. Claiming `user` or `service` is
   * ignored — those are always taken from the verified caller, so a credential cannot impersonate an operator.
   */
  actorType: z.literal("system").optional(),
});

type RecordEvent = (input: CredentialEventInput) => Promise<{ id: string }>;

/**
 * Platform credential lifecycle — audit phase B.
 *
 * Two surfaces:
 *   POST /events     record a creation / grant / key / deactivation fact
 *   GET  /reconcile  compare the IdP's live grants with what the stream recorded
 *
 * Reconciliation is the honest part: it does not claim to mirror ZITADEL. It reports drift, so a console change
 * surfaces as `unrecorded` instead of silently widening who can move tenants.
 */
export function createPlatformCredentialRoutes(deps: {
  evidence: EvidenceService;
  record: RecordEvent;
  /** Live grants in the platform project, read from the IdP. */
  liveGrants: () => Promise<CredentialGrant[]>;
}) {
  const routes = new Hono();

  routes.post("/events", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const parsed = eventSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid credential event", details: parsed.error.flatten() }, 400);
    }

    const { actorType, ...event } = parsed.data;
    const recorded = await deps.record({
      ...event,
      // A credential never vouches for itself: the actor is the operator that performed the change, unless the
      // caller explicitly marks a bootstrap, which is attributed to `system` and nothing more specific.
      actorType: actorType === "system" ? "system" : "service",
      actorId: actorType === "system" ? "system" : operator.userId,
    });
    return ok(c, recorded);
  });

  routes.get("/reconcile", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.PLATFORM_AUDIT_READ)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const [liveGrants, recordedGrants] = await Promise.all([
      deps.liveGrants(),
      readRecordedGrants(deps.evidence),
    ]);
    return ok(c, { subjectType: CREDENTIAL_SUBJECT_TYPE, ...reconcileGrants({ liveGrants, recordedGrants }) });
  });

  return routes;
}
