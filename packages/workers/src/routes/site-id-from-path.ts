/** /api/edge/schema/:siteId, /api/tenants/:siteId/..., or /api/auth/:siteId/... */
export function siteIdFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1] === "edge" && parts[2] === "schema" && parts[3]) {
    return parts[3];
  }
  if (parts[0] === "api" && parts[1] === "tenants" && parts[2] && parts[2] !== "resolve") {
    return parts[2];
  }
  if (parts[0] === "api" && parts[1] === "auth" && parts[2]) {
    return parts[2];
  }
  return "";
}
