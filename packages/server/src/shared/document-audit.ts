import type { WriteAudit } from "@noname/auth";
import type { DocumentStorage } from "../domains/documents/ports";

export async function recordDocumentOp(
  storage: DocumentStorage,
  input: {
    orgId: string;
    documentId: string;
    operation: string;
    audit: WriteAudit;
  },
): Promise<void> {
  await storage.recordDocumentOp(input);
}
