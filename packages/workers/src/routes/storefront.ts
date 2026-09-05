import { fetchWithTimeout } from "@noname/auth";
import { storeSlugFromHost } from "@noname/shared";
import { Hono } from "hono";
import { getCached, setCache } from "../cache";
import { hmacHeaders } from "../hmac";
import { resolveSiteId } from "../resolve-slug";
import type { Env } from "../types";
import { extractSeoFromLayout, isBotUserAgent, renderBotHtml } from "./bot-ssr";

const INDEX_HTML_KEY = "_assets/index.html";
const SCHEMA_TIMEOUT_MS = 4_000;
const BOT_SCHEMA_CACHE_TTL = 300;

interface EdgeSchemaPayload {
  layout?: Record<string, unknown> | null;
  templateName?: string;
}

async function fetchStorefrontSchema(
  env: Env,
  siteId: string,
  pathname: string,
): Promise<EdgeSchemaPayload | null> {
  const cacheKey = `bot-schema:${siteId.toLowerCase()}:${pathname.toLowerCase()}`;
  try {
    const cached = await getCached<EdgeSchemaPayload>(env, cacheKey);
    if (cached) return cached;
  } catch {
    // cache miss — fetch origin
  }

  const orgId = await resolveSiteId(env, siteId);
  if (!orgId) return null;

  const signed = await hmacHeaders(orgId, "", "", env);
  const qs = new URLSearchParams({ segment: "default", url: pathname });
  try {
    const res = await fetchWithTimeout(
      `${env.API_ORIGIN}/api/edge/schema/${encodeURIComponent(siteId)}?${qs}`,
      { headers: signed },
      SCHEMA_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.warn(`[storefront] bot schema ${siteId}${pathname} upstream ${res.status}`);
      return null;
    }

    const body = (await res.json()) as { data?: EdgeSchemaPayload };
    const data = body.data ?? null;
    if (data) await setCache(env, cacheKey, data, BOT_SCHEMA_CACHE_TTL);
    return data;
  } catch (err) {
    console.warn(`[storefront] bot schema fetch timeout/fail ${siteId}${pathname}`, err);
    return null;
  }
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

    if (pathname === "/favicon.ico" || pathname === "/robots.txt") {
      c.header("Cache-Control", "public, max-age=86400");
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
      if (!schema) {
        const shell = await serveIndexHtml(c.env);
        if (shell) return shell;
      }
      const layout = schema?.layout ?? null;
      const seo = extractSeoFromLayout(layout);
      const html = renderBotHtml(seo, siteId);
      c.header("Cache-Control", "public, max-age=300");
      c.header("Vary", "User-Agent");
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
