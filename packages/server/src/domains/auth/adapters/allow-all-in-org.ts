import type { AuthorizationPort } from "../authorization-port";

/** v1 behavior: org-level platform permissions are enough; no document tuples. */
export function createAllowAllInOrgAdapter(): AuthorizationPort {
  return {
    async check() {
      return true;
    },
    async grant() {},
    async revoke() {},
    async listDirectUserEditors() {
      return [];
    },
    async listDirectUserPublishers() {
      return [];
    },
    async listRelationTuples() {
      return [];
    },
  };
}
