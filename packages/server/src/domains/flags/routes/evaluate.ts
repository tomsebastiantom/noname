import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId, getUserId, requireHeaderOrgId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { EvaluationSubject, FlagEvaluationContext } from "../ports";
import type { FlagRouteDeps } from "./deps";

interface EvaluationRequest {
  subject?: Partial<EvaluationSubject>;
  /** Current request envelope; only its anonymous session subject is used. */
  context?: { subject?: Partial<EvaluationSubject>; [key: string]: unknown };
  /** Accepted only as an anonymous, non-authoritative rollout key. */
  sessionKey?: string;
  flagKeys?: string[];
  keys?: string[];
  contexts?: Array<{
    subject?: Partial<EvaluationSubject>;
    context?: { subject?: Partial<EvaluationSubject>; [key: string]: unknown };
    sessionKey?: string;
    [key: string]: unknown;
  }>;
}

export function registerFlagEvaluateRoutes(routes: Hono, deps: FlagRouteDeps): void {
  const { service } = deps;

  routes.post("/evaluate", async (c) => {
    const body = await c.req.json<EvaluationRequest & Record<string, unknown>>();
    if (
      hasLegacyHashAlias(body) ||
      hasLegacyHashAlias(body.subject) ||
      hasLegacyHashAlias(body.context)
    ) {
      return c.json(
        { error: "Legacy hash and segment fields are not supported for evaluation." },
        400,
      );
    }
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;
    const context = routeContext(orgId, getUserId(c), body);
    const flagKeys = body.flagKeys ?? body.keys;
    const evaluations = await service.evaluate(orgId, context, flagKeys);
    return ok(c, { evaluations });
  });

  routes.post("/evaluate-batch", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<EvaluationRequest & Record<string, unknown>>();
    if (
      hasLegacyHashAlias(body) ||
      (Array.isArray(body.contexts) &&
        body.contexts.some(
          (context) =>
            hasLegacyHashAlias(context) ||
            hasLegacyHashAlias(context.subject) ||
            hasLegacyHashAlias(context.context),
        ))
    ) {
      return c.json(
        { error: "Legacy hash and segment fields are not supported for evaluation." },
        400,
      );
    }
    const contexts = (body.contexts ?? []).map((input) => routeContext(orgId, getUserId(c), input));
    const results = await service.evaluateBatch(orgId, contexts, body.flagKeys);
    return ok(c, { results });
  });
}

/** Route boundary deliberately drops all client audience, properties and scope metadata. */
function routeContext(
  orgId: string,
  userId: string | undefined,
  input: Pick<EvaluationRequest, "subject" | "context" | "sessionKey">,
): Partial<FlagEvaluationContext> {
  const subject = trustedSubject(userId, input);
  return {
    orgId,
    subject,
    audienceKeys: [],
    contextProperties: {},
    schemaId: null,
    variantId: null,
  };
}

function trustedSubject(
  userId: string | undefined,
  input: Pick<EvaluationRequest, "subject" | "context" | "sessionKey">,
): EvaluationSubject {
  if (userId?.trim()) return { kind: "account", key: userId.trim() };

  const suppliedSubject = input.subject ?? input.context?.subject;
  const sessionKey =
    (suppliedSubject?.kind === "session" ? suppliedSubject.key : undefined) ?? input.sessionKey;
  if (typeof sessionKey === "string" && sessionKey.trim()) {
    return { kind: "session", key: sessionKey.trim() };
  }
  return { kind: "global", key: "global" };
}

function hasLegacyHashAlias(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return ["contextHash", "context_hash", "segment", "segmentHash", "hash"].some(
    (key) => key in value,
  );
}
