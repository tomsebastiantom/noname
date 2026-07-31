import type { Hono } from "hono";
import { ValidationError } from "../../../shared/domain-error";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { isSupportedLoginProvider } from "../../documents/contracts";
import type { AuthRouteDeps } from "./deps";
import { oauthCallbackBodySchema, oauthStartQuerySchema } from "./schemas";

export function registerAuthOAuthRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.get("/:orgId/idp/:provider/start", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const provider = c.req.param("provider");
    if (!isSupportedLoginProvider(provider)) {
      throw new ValidationError("provider", "Unsupported identity provider");
    }

    const query = parseBody(
      oauthStartQuerySchema.safeParse({
        clientId: c.req.query("clientId"),
        redirectUri: c.req.query("redirectUri"),
        codeChallenge: c.req.query("codeChallenge"),
      }),
      "OAuth start parameters",
    );

    return ok(
      c,
      await service.startIdpLogin({
        orgId,
        provider,
        clientId: query.clientId,
        redirectUri: query.redirectUri,
        codeChallenge: query.codeChallenge,
      }),
    );
  });

  routes.post("/:orgId/callback", async (c) => {
    const body = parseBody(
      oauthCallbackBodySchema.safeParse(await c.req.json()),
      "OAuth callback payload",
    );
    const result = await service.exchangeOAuthCallback(body);
    return ok(c, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
  });
}
