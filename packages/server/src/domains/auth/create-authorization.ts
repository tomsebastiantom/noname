import { createKetoAuthorizationAdapter } from "./adapters/keto/authorization";
import { ketoReadUrl, ketoWriteUrl } from "./authorization-config";
import type { AuthorizationPort } from "./authorization-port";

function ketoAdapter(): AuthorizationPort {
  return createKetoAuthorizationAdapter({
    readUrl: ketoReadUrl(),
    writeUrl: ketoWriteUrl(),
  });
}

/** Document scope checks — always Keto (requires Keto running). */
export function createAuthorization(): AuthorizationPort {
  return ketoAdapter();
}

/** Tuple writes — always Keto (same as checks). */
export function createTupleWriter(): Pick<AuthorizationPort, "grant" | "revoke"> {
  return ketoAdapter();
}
