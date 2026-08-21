/** Platform OIDC project id — set by `pnpm init:zitadel` as ZITADEL_PROJECT_ID. */

import { ServiceUnavailableError } from "../../../../shared/domain-error";
/** Platform OIDC project id — set by `pnpm init:zitadel` as ZITADEL_PROJECT_ID. */
export function zitadelProjectId(): string {
  const id = process.env.ZITADEL_PROJECT_ID?.trim();
  if (!id) {
    throw new ServiceUnavailableError("ZITADEL_PROJECT_ID is not set — run pnpm init:zitadel");
  }
  return id;
}

export function zitadelProjectIdOrNull(): string | null {
  const id = process.env.ZITADEL_PROJECT_ID?.trim();
  return id || null;
}
