import {
  accessTokenFromRequest,
  canDraft,
  EDIT_MODE_FORBIDDEN_ERROR,
  fetchWithTimeout,
  isEditModeUrl,
} from "@noname/auth";
import { Hono } from "hono";
import { tryParseJwt, validateJwt } from "../auth";
import { hmacHeaders } from "../hmac";
import type { Env } from "../types";
import {
  isCollabWsWithTicket,
  isWebSocketUpgrade,
  proxyWebSocketToOrigin,
} from "./proxy-websocket";
import { routeIsPublic } from "./public-routes";
import { resolveProxyOrgId } from "./resolve-proxy-org";
import {
  shouldStripBodyOrg,
  stripOrgFromPublicJsonBody,
  stripOrgFromSearch,
} from "./strip-public-org";

function isResolveSlugPath(pathname: string): boolean {
  return /^\/api\/tenants\/resolve\/[^/]+$/.test(pathname);
}

function hasStreamTicket(url: URL): boolean {
  if (!url.searchParams.has("stream_ticket")) return false;
  return (
    url.pathname === "/api/flags/stream" || url.pathname === "/api/notifications/stream"
  );
}

function hasCollabTicket(url: URL): boolean {
  return isCollabWsWithTicket(url);
}

async function resolveJwt(
  req: Request,
  env: Env,
): Promise<Awaited<ReturnType<typeof tryParseJwt>> | Response> {
  const existing = await tryParseJwt(req, env);
  if (existing) return existing;
  return validateJwt(req, env);
}

export function createApiProxyRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.all("/*", async (c) => {
    const incoming = new URL(c.req.url);
    const pathname = incoming.pathname;
    const search = stripOrgFromSearch(pathname, incoming.search);
    const isPublic = routeIsPublic(c.req.method, pathname);
    const webSocketUpgrade = isWebSocketUpgrade(c.req.header("upgrade"));
    const streamTicketBypass = hasStreamTicket(incoming);
    const collabTicketBypass = hasCollabTicket(incoming);
    const flagsTicketBypass = streamTicketBypass;
    const editMode = isEditModeUrl(incoming);
    const apiOrigin = c.env.API_ORIGIN;
    const target = `${apiOrigin}${pathname}${search}`;

    let jwt: Awaited<ReturnType<typeof tryParseJwt>> = null;

    if (editMode) {
      const auth = await resolveJwt(c.req.raw, c.env);
      if (auth instanceof Response) return auth;
      jwt = auth;
      if (!jwt || !canDraft(jwt.roles ?? [])) {
        return c.json({ error: EDIT_MODE_FORBIDDEN_ERROR }, 403);
      }
    } else if (!isPublic && !streamTicketBypass && !collabTicketBypass && !flagsTicketBypass) {
      const auth = await resolveJwt(c.req.raw, c.env);
      if (auth instanceof Response) return auth;
      jwt = auth;
    }

    const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "";
    const orgId = await resolveProxyOrgId(
      c.env,
      pathname,
      host,
      jwt?.orgId,
      c.req.header("x-org-id") ?? undefined,
    );

    if (!orgId && !isResolveSlugPath(pathname)) {
      if (streamTicketBypass || collabTicketBypass || flagsTicketBypass) {
        return c.json({ error: "Invalid ticket or org id required" }, 401);
      }
      return c.json({ error: "org id required (JWT, URL path, or Host)" }, 400);
    }

    if (!orgId) {
      // resolve-slug path with no org — preserve null, do not sign empty org as valid
      return c.json({ error: "org id required (JWT, URL path, or Host)" }, 400);
    }

    const signed = await hmacHeaders(orgId, jwt?.userId ?? "", jwt?.role ?? "", c.env);

    if (webSocketUpgrade) {
      return proxyWebSocketToOrigin(target, c.req.raw.headers, signed);
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(signed)) {
      headers.set(key, value);
    }
    const contentType = c.req.header("Content-Type");
    if (contentType) headers.set("Content-Type", contentType);
    const traceparent = c.req.header("traceparent");
    if (traceparent) headers.set("traceparent", traceparent);
    const tracestate = c.req.header("tracestate");
    if (tracestate) headers.set("tracestate", tracestate);
    const authorization = c.req.header("Authorization");
    if (authorization) {
      headers.set("Authorization", authorization);
    } else {
      const token = accessTokenFromRequest(c.req.raw);
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    const webhookSignature = c.req.header("x-webhook-signature");
    if (webhookSignature) headers.set("x-webhook-signature", webhookSignature);
    const stripeSignature = c.req.header("stripe-signature");
    if (stripeSignature) headers.set("stripe-signature", stripeSignature);

    const init: RequestInit = {
      method: c.req.method,
      headers,
    };
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const stripOrg = shouldStripBodyOrg(pathname, c.req.method);
      const contentType = c.req.header("Content-Type") ?? "";
      const gzipReplay =
        pathname === "/api/analytics/replay" && contentType.includes("application/gzip");
      if (stripOrg && !gzipReplay) {
        let body = await c.req.raw.clone().text();
        body = stripOrgFromPublicJsonBody(pathname, body);
        init.body = body;
      } else {
        init.body = c.req.raw.body;
      }
    }

    const response = await fetchWithTimeout(target, init);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  });

  return routes;
}
