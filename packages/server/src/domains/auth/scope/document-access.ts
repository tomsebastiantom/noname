import type { AuthSubject } from "../authorization-port";
import type { ScopeDeps } from "./deps";
import { assertTeamSlotRole, requireDocumentInOrg } from "./helpers";

export function createDocumentAccessOps(deps: ScopeDeps) {
  return {
    async listDocumentEditors(orgId: string, documentId: string): Promise<AuthSubject[]> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      return deps.tupleReader.listDirectUserEditors("Document", documentId);
    },

    async grantDocumentEditor(orgId: string, documentId: string, userId: string): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await deps.tupleWriter.grant({
        namespace: "Document",
        objectId: documentId,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async revokeDocumentEditor(orgId: string, documentId: string, userId: string): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await deps.tupleWriter.revoke({
        namespace: "Document",
        objectId: documentId,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async listDocumentPublishers(orgId: string, documentId: string): Promise<AuthSubject[]> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      return deps.tupleReader.listDirectUserPublishers("Document", documentId);
    },

    async grantDocumentPublisher(orgId: string, documentId: string, userId: string): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await assertTeamSlotRole(deps.resolveUserStaffRole, orgId, userId, "publishers");
      await deps.tupleWriter.grant({
        namespace: "Document",
        objectId: documentId,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },

    async revokeDocumentPublisher(
      orgId: string,
      documentId: string,
      userId: string,
    ): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await deps.tupleWriter.revoke({
        namespace: "Document",
        objectId: documentId,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },
  };
}
