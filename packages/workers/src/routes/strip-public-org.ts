/** Paths where org comes from edge Host/JWT — strip client orgId before API forward. */

const STRIP_BODY_ORG_POST = [
  /^\/api\/analytics\/track$/,
  /^\/api\/analytics\/error$/,
  /^\/api\/analytics\/replay$/,
  /^\/api\/flags\/evaluate$/,
] as const;

const STRIP_QUERY_ORG_GET = [/^\/api\/flags\/stream$/] as const;

export function shouldStripBodyOrg(pathname: string, method: string): boolean {
  return method === "POST" && STRIP_BODY_ORG_POST.some((re) => re.test(pathname));
}

export function shouldStripQueryOrg(pathname: string, method: string): boolean {
  return method === "GET" && STRIP_QUERY_ORG_GET.some((re) => re.test(pathname));
}

/** Remove orgId from public SDK JSON bodies — edge already resolved org into x-org-id. */
export function stripOrgFromPublicJsonBody(pathname: string, bodyText: string): string {
  if (!bodyText.trim()) return bodyText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return bodyText;
  }

  if (pathname === "/api/flags/evaluate" && parsed && typeof parsed === "object") {
    const body = parsed as Record<string, unknown>;
    if (body.context && typeof body.context === "object" && body.context !== null) {
      const { orgId: _removed, ...rest } = body.context as Record<string, unknown>;
      body.context = rest;
    }
    return JSON.stringify(body);
  }

  if (Array.isArray(parsed)) {
    return bodyText;
  }

  if (parsed && typeof parsed === "object") {
    const { orgId: _removed, ...rest } = parsed as Record<string, unknown>;
    return JSON.stringify(rest);
  }

  return bodyText;
}

/** Drop orgId query param — server uses x-org-id from edge only. */
export function stripOrgFromSearch(pathname: string, search: string): string {
  if (!search || !shouldStripQueryOrg(pathname, "GET")) {
    return search;
  }
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("orgId");
  const next = params.toString();
  return next ? `?${next}` : "";
}
