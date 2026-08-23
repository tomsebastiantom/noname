/** Routes that skip JWT at the edge worker (anonymous browser SDK / auth flows). */

export const PUBLIC_GET_PATTERNS = [
  /^\/api\/edge\/schema\/[^/]+$/,
  /^\/api\/tenants\/resolve\/[^/]+$/,
  /^\/api\/tenants\/[^/]+\/catalog$/,
  /^\/api\/auth\/[^/]+\/config$/,
  /^\/api\/auth\/[^/]+\/idp\/[^/]+\/start$/,
  /** Anonymous storefront flag metadata (safe fields only — no targeting config). */
  /^\/api\/flags\/public$/,
  /^\/health$/,
] as const;

export const PUBLIC_POST_PATTERNS = [
  /^\/api\/auth\/[^/]+\/login$/,
  /^\/api\/auth\/[^/]+\/register$/,
  /^\/api\/auth\/[^/]+\/password-reset\/request$/,
  /^\/api\/auth\/[^/]+\/password-reset\/confirm$/,
  /^\/api\/auth\/[^/]+\/mfa\/verify$/,
  /^\/api\/auth\/[^/]+\/callback$/,
  /** Anonymous storefront SDK ingest — org resolved from Host at edge. */
  /^\/api\/analytics\/track$/,
  /^\/api\/analytics\/error$/,
  /^\/api\/analytics\/replay$/,
  /** Anonymous flag evaluation from browser SDK. */
  /^\/api\/flags\/evaluate$/,
  /** Anonymous flag SSE ticket minting — org comes from x-org-id signed at edge. */
  /^\/api\/flags\/stream\/ticket$/,
  /** Anonymous flag SSE ticket minting — EventSource cannot send headers. */
  /^\/api\/flags\/stream\/ticket$/,
  /** Provider business webhooks — verified in webhooks domain. */
  /^\/api\/webhooks\/inbound\/[^/]+$/,
  /** Comms provider lifecycle webhooks (Resend / SES / Twilio). */
  /^\/api\/notifications\/webhooks\/[^/]+$/,
  /** Nango OAuth connect callback. */
  /^\/api\/integrations\/nango\/webhook$/,
] as const;

export const PUBLIC_GET_EXTRA_PATTERNS = [
  /** Anonymous flag SSE from browser SDK. */
  /^\/api\/flags\/stream$/,
] as const;

export function isPublicGet(method: string, pathname: string): boolean {
  return (
    method === "GET" &&
    (PUBLIC_GET_PATTERNS.some((re) => re.test(pathname)) ||
      PUBLIC_GET_EXTRA_PATTERNS.some((re) => re.test(pathname)))
  );
}

export function isPublicPost(method: string, pathname: string): boolean {
  return method === "POST" && PUBLIC_POST_PATTERNS.some((re) => re.test(pathname));
}
