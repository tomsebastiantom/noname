import { Hono } from "hono";
import { tryParseJwt, validateJwt } from "../auth";
import { hmacHeaders } from "../hmac";
import type { Env } from "../types";

const PUBLIC_GET = [
  /^\/api\/edge\/schema\/[^/]+$/,
  /^\/api\/tenants\/[^/]+\/catalog$/,
  /^\/health$/,
];

function isPublicGet(method: string, pathname: string): boolean {
  return method === "GET" && PUBLIC_GET.some((re) => re.test(pathname));
}

/** /api/edge/schema/:orgId or /api/tenants/:orgId/... */
function orgIdFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1] === "edge" && parts[2] === "schema" && parts[3]) {
    return parts[3];
  }
  if (parts[0] === "api" && parts[1] === "tenants" && parts[2]) {
    return parts[2];
  }
  return "";
}

export function createApiProxyRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.all("/*", async (c) => {
    const incoming = new URL(c.req.url);
    const pathname = incoming.pathname;
    const target = `${c.env.API_ORIGIN}${pathname}${incoming.search}`;

    const jwt = await tryParseJwt(c.req.raw, c.env);
    const orgId =
      jwt?.orgId || c.req.header("x-org-id") || orgIdFromPath(pathname) || "";

    if (!orgId) {
      return c.json({ error: "org id required (header, JWT, or URL)" }, 400);
    }

    if (!isPublicGet(c.req.method, pathname) && !jwt) {
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
