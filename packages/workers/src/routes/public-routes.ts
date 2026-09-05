/** Routes that skip JWT at the edge worker (anonymous browser SDK / auth flows). Single source of truth. */

export interface PublicRoute {
  method: "GET" | "POST";
  pattern: RegExp;
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  { method: "GET", pattern: /^\/api\/edge\/schema\/[^/]+$/ },
  { method: "GET", pattern: /^\/api\/tenants\/resolve\/[^/]+$/ },
  { method: "GET", pattern: /^\/api\/tenants\/[^/]+\/catalog$/ },
  { method: "GET", pattern: /^\/api\/auth\/[^/]+\/config$/ },
  { method: "GET", pattern: /^\/api\/auth\/[^/]+\/idp\/[^/]+\/start$/ },
  /** Anonymous storefront flag metadata (safe fields only — no targeting config). */
  { method: "GET", pattern: /^\/api\/flags\/public$/ },
  { method: "GET", pattern: /^\/health$/ },
  /** Anonymous flag SSE — ticket verified at origin; edge allows without JWT. */
  { method: "GET", pattern: /^\/api\/flags\/stream$/ },
  { method: "POST", pattern: /^\/api\/auth\/[^/]+\/login$/ },
  { method: "POST", pattern: /^\/api\/auth\/[^/]+\/register$/ },
  { method: "POST", pattern: /^\/api\/auth\/[^/]+\/password-reset\/request$/ },
  { method: "POST", pattern: /^\/api\/auth\/[^/]+\/password-reset\/confirm$/ },
  { method: "POST", pattern: /^\/api\/auth\/[^/]+\/mfa\/verify$/ },
  { method: "POST", pattern: /^\/api\/auth\/[^/]+\/callback$/ },
  /** Anonymous storefront SDK ingest — org resolved from Host at edge. */
  { method: "POST", pattern: /^\/api\/analytics\/track$/ },
  { method: "POST", pattern: /^\/api\/analytics\/error$/ },
  { method: "POST", pattern: /^\/api\/analytics\/replay$/ },
  /** Anonymous flag evaluation from browser SDK. */
  { method: "POST", pattern: /^\/api\/flags\/evaluate$/ },
  /** Anonymous flag SSE ticket minting — EventSource cannot send headers. */
  { method: "POST", pattern: /^\/api\/flags\/stream\/ticket$/ },
  /** Provider business webhooks — verified in webhooks domain. */
  { method: "POST", pattern: /^\/api\/webhooks\/inbound\/[^/]+$/ },
  /** Comms provider lifecycle webhooks (Resend / SES / Twilio). */
  { method: "POST", pattern: /^\/api\/notifications\/webhooks\/[^/]+$/ },
  /** Nango OAuth connect callback. */
  { method: "POST", pattern: /^\/api\/integrations\/nango\/webhook$/ },
];

export function routeIsPublic(method: string, pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => r.method === method && r.pattern.test(pathname));
}

export function isPublicGet(method: string, pathname: string): boolean {
  return routeIsPublic(method, pathname);
}

export function isPublicPost(method: string, pathname: string): boolean {
  return routeIsPublic(method, pathname);
}
