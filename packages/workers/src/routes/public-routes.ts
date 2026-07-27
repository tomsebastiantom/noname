/** Routes that skip JWT at the edge worker (anonymous browser SDK / auth flows). */

export const PUBLIC_GET_PATTERNS = [
  /^\/api\/edge\/schema\/[^/]+$/,
  /^\/api\/tenants\/resolve\/[^/]+$/,
  /^\/api\/tenants\/[^/]+\/catalog$/,
  /^\/api\/tenants\/[^/]+\/auth\/config$/,
  /^\/api\/tenants\/[^/]+\/auth\/idp\/[^/]+\/start$/,
  /^\/health$/,
] as const;

export const PUBLIC_POST_PATTERNS = [
  /^\/api\/tenants\/[^/]+\/auth\/login$/,
  /^\/api\/tenants\/[^/]+\/auth\/register$/,
  /^\/api\/tenants\/[^/]+\/auth\/password-reset\/request$/,
  /^\/api\/tenants\/[^/]+\/auth\/password-reset\/confirm$/,
  /^\/api\/tenants\/[^/]+\/auth\/mfa\/verify$/,
  /^\/api\/tenants\/[^/]+\/auth\/callback$/,
  /** Anonymous storefront SDK ingest — org resolved from Host at edge. */
  /^\/api\/analytics\/track$/,
  /^\/api\/analytics\/error$/,
  /^\/api\/analytics\/replay$/,
  /** Anonymous flag evaluation from browser SDK. */
  /^\/api\/flags\/evaluate$/,
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
