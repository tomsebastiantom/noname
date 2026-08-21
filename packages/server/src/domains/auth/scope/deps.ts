import type { StaffRole } from "@noname/auth";
import type { Database } from "../../../drizzle";
import type { DocumentStorage } from "../../documents/ports";
import type { AuthorizationPort } from "../authorization-port";

export interface ScopeDeps {
  db: Database;
  storage: DocumentStorage;
  tupleWriter: Pick<AuthorizationPort, "grant" | "revoke">;
  tupleReader: Pick<
    AuthorizationPort,
    "listDirectUserEditors" | "listDirectUserPublishers" | "listRelationTuples"
  >;
  resolveUserStaffRole: (orgId: string, userId: string) => Promise<StaffRole | null>;
}
