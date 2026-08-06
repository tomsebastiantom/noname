import { fetchWithTimeout } from "@noname/auth";
import { storeSlugFromHost } from "@noname/shared";
import { Hono } from "hono";
import { hmacHeaders } from "../hmac";
import { resolveSiteId } from "../resolve-slug";
import type { Env } from "../types";
import { extractSeoFromLayout, isBotUserAgent, renderBotHtml } from "./bot-ssr";

const INDEX_HTML_KEY = "_assets/index.html";
const SCHEMA_TIMEOUT_MS = 20_000;

interface EdgeSchemaPayload {
  layout?: Record<string, unknown> | null;
  templateName?: string;
}

async function fetchStorefrontSchema(
  env: Env,
  siteId: string,
  pathname: string,
): Promise<EdgeSchemaPayload | null> {
  const orgId = await resolveSiteId(env, siteId);
  if (!orgId) return null;

  const signed = await hmacHeaders(orgId, "", "", env);
  const qs = new URLSearchParams({ segment: "default", url: pathname });
  const res = await fetchWithTimeout(
    `${env.API_ORIGIN}/api/edge/schema/${encodeURIComponent(siteId)}?${qs}`,
    { headers: signed },
    SCHEMA_TIMEOUT_MS,
  );
  if (!res.ok) return null;

  const body = (await res.json()) as { data?: EdgeSchemaPayload };
  return body.data ?? null;
}

async function serveIndexHtml(env: Env): Promise<Response | null> {
  const object = await env.R2.get(INDEX_HTML_KEY);
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=60");

  return new Response(object.body, { headers });
}

export function createStorefrontRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("*", async (c) => {
    const url = new URL(c.req.url);
    const pathname = url.pathname;

    if (
      pathname.startsWith("/_assets/") ||
      pathname.startsWith("/api/") ||
      pathname === "/health"
    ) {
      return c.notFound();
    }

    const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "";
    const siteId = storeSlugFromHost(host);
    if (!siteId) {
      return c.text(
        "Use {slug}.localhost — e.g. yogastore.localhost (deploy client bundle to R2)",
        404,
      );
    }

    const userAgent = c.req.header("User-Agent");

    if (isBotUserAgent(userAgent)) {
      const schema = await fetchStorefrontSchema(c.env, siteId, pathname);
      const layout = schema?.layout ?? null;
      const seo = extractSeoFromLayout(layout);
      const html = renderBotHtml(seo, siteId);
      return c.html(html);
    }

    const shell = await serveIndexHtml(c.env);
    if (!shell) {
      return c.text(
        "Storefront bundle not deployed. Run: pnpm deploy:client-r2 (see docs/2026-08-06/STOREFRONT-PROD-I1-I2-RUNBOOK.md)",
        503,
      );
    }
    return shell;
  });

  return routes;
}
