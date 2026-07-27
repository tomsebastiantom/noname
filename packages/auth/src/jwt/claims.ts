/** ZITADEL org id from JWT / userinfo payload. */
export function orgIdFromTokenPayload(payload: Record<string, unknown>): string {
  return (
    (payload["urn:zitadel:iam:org:id"] as string) ||
    (payload.org_id as string) ||
    (payload.tenant_id as string) ||
    ""
  );
}
