import { canDraft, EDIT_MODE_FORBIDDEN_ERROR, isEditModeUrl } from "@noname/auth";
import { Hono } from "hono";
import { tryParseJwt, validateJwt } from "../auth";
import { hmacHeaders } from "../hmac";
import { resolveOrgIdFromHost, resolveSiteId } from "../resolve-slug";
import type { Env } from "../types";

const PUBLIC_GET = [
  /^\/api\/edge\/schema\/[^/]+$/,
  /^\/api\/tenants\/resolve\/[^/]+$/,
  /^\/api\/tenants\/[^/]+\/catalog$/,
  /^\/api\/tenants\/[^/]+\/auth\/config$/,
  /^\/api\/tenants\/[^/]+\/auth\/idp\/[^/]+\/start$/,
  /^\/health$/,
];

const PUBLIC_POST = [
  /^\/api\/tenants\/[^/]+\/auth\/login$/,
  /^\/api\/tenants\/[^/]+\/auth\/register$/,
  /^\/api\/tenants\/[^/]+\/auth\/password-reset\/request$/,
  /^\/api\/tenants\/[^/]+\/auth\/password-reset\/confirm$/,
  /^\/api\/tenants\/[^/]+\/auth\/mfa\/verify$/,
  /^\/api\/tenants\/[^/]+\/auth\/callback$/,
];

function isPublicGet(method: string, pathname: string): boolean {
  return method === "GET" && PUBLIC_GET.some((re) => re.test(pathname));
}

function isPublicPost(method: string, pathname: string): boolean {
  return method === "POST" && PUBLIC_POST.some((re) => re.test(pathname));
}

/** /api/edge/schema/:siteId or /api/tenants/:siteId/... */
function siteIdFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1] === "edge" && parts[2] === "schema" && parts[3]) {
    return parts[3];
  }
  if (parts[0] === "api" && parts[1] === "tenants" && parts[2] && parts[2] !== "resolve") {
    return parts[2];
  }
  return "";
}

function isResolveSlugPath(pathname: string): boolean {
  return /^\/api\/tenants\/resolve\/[^/]+$/.test(pathname);
}

export function createApiProxyRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.all("/*", async (c) => {
    const incoming = new URL(c.req.url);
    const pathname = incoming.pathname;
    const target = `${c.env.API_ORIGIN}${pathname}${incoming.search}`;

    const jwt = await tryParseJwt(c.req.raw, c.env);

    if (isEditModeUrl(incoming)) {
      let editCtx = jwt;
      if (!editCtx) {
        const auth = await validateJwt(c.req.raw, c.env);
        if (auth instanceof Response) return auth;
        editCtx = auth;
      }
      if (!canDraft(editCtx.roles ?? [])) {
        return c.json({ error: EDIT_MODE_FORBIDDEN_ERROR }, 403);
      }
    }

    let orgId = jwt?.orgId || "";

    if (!orgId) {
      const fromPath = siteIdFromPath(pathname);
      if (fromPath) {
        orgId = (await resolveSiteId(c.env, fromPath)) ?? "";
      }
    }

    if (!orgId) {
      orgId = (await resolveOrgIdFromHost(c.env, c.req.header("host") ?? "")) ?? "";
    }

    if (!orgId) {
      orgId = c.req.header("x-org-id") || "";
    }

    if (!orgId && !isResolveSlugPath(pathname)) {
      return c.json({ error: "org id required (JWT, URL path, or Host)" }, 400);
    }

    if (!isPublicGet(c.req.method, pathname) && !isPublicPost(c.req.method, pathname) && !jwt) {
      const auth = await validateJwt(c.req.raw, c.env);
      if (auth instanceof Response) return auth;
    }

    const signed = await hmacHeaders(orgId, jwt?.userId ?? "", jwt?.role ?? "", c.env);

    const headers = new Headers();
    for (const [key, value] of Object.entries(signed)) {
      headers.set(key, value);
    }
    const contentType = c.req.header("Content-Type");
    if (contentType) headers.set("Content-Type", contentType);
    const authorization = c.req.header("Authorization");
    if (authorization) headers.set("Authorization", authorization);

    const init: RequestInit = {
      method: c.req.method,
      headers,
    };
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      init.body = await c.req.raw.clone().arrayBuffer();
    }

    const response = await fetch(target, init);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  });

  return routes;
}
