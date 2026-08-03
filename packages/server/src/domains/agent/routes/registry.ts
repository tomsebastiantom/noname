import { isPermissionKey, PERMISSIONS, type PermissionKey } from "@noname/auth";
import type { Hono } from "hono";
import { z } from "zod";
import { getOrgId } from "../../../shared/org";
import { parseBody } from "../../../shared/parse-body";
import { created, ok } from "../../../shared/respond";
import { requireHumanPermission } from "../../auth/guards";
import type { AgentRegistryService } from "../registry-service";

const registerAgentSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1).optional(),
  allowedTools: z.array(z.string()).optional(),
});

const mintTokenSchema = z.object({
  permissions: z.array(z.string()).optional(),
});

export function registerAgentRegistryRoutes(routes: Hono, registry: AgentRegistryService): void {
  routes.get("/registry", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (auth instanceof Response) return auth;
    return ok(c, await registry.list(getOrgId(c)));
  });

  routes.post("/registry", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (auth instanceof Response) return auth;
    const body = parseBody(registerAgentSchema.safeParse(await c.req.json()), "agent payload");
    const agent = await registry.register(getOrgId(c), body, {
      userId: auth.userId,
      permissions: auth.permissions,
    });
    return created(c, agent);
  });

  routes.delete("/registry/:id", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (auth instanceof Response) return auth;
    await registry.delete(getOrgId(c), c.req.param("id"), {
      userId: auth.userId,
      permissions: auth.permissions,
    });
    return ok(c, { ok: true });
  });

  routes.post("/registry/:id/token", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (auth instanceof Response) return auth;
    const raw = mintTokenSchema.safeParse(await c.req.json().catch(() => ({})));
    const body = parseBody(raw, "token payload");
    const requested = body.permissions?.filter((entry): entry is PermissionKey =>
      isPermissionKey(entry),
    );
    const minted = await registry.mintToken(
      getOrgId(c),
      c.req.param("id"),
      {
        userId: auth.userId,
        userToken: auth.userToken,
        permissions: auth.permissions,
      },
      requested,
    );
    return ok(c, minted);
  });

  routes.put("/registry/:id/collections/:collection/editors", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (auth instanceof Response) return auth;
    await registry.grantCollectionEditor(
      getOrgId(c),
      c.req.param("id"),
      c.req.param("collection"),
      {
        userId: auth.userId,
        userToken: auth.userToken,
        permissions: auth.permissions,
      },
    );
    return ok(c, { ok: true });
  });

  routes.put("/registry/:id/documents/:documentId/editors", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (auth instanceof Response) return auth;
    await registry.grantDocumentEditor(getOrgId(c), c.req.param("id"), c.req.param("documentId"), {
      userId: auth.userId,
      userToken: auth.userToken,
      permissions: auth.permissions,
    });
    return ok(c, { ok: true });
  });
}
