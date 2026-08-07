import type { WriteAudit } from "@noname/auth";
import type { DocumentOpPayload } from "../domains/documents/document-op-payload";
import type { DocumentStorage } from "../domains/documents/ports";

export async function recordDocumentOp(
  storage: Pick<DocumentStorage, "recordDocumentOp">,
  input: {
    orgId: string;
    documentId: string;
    operation: string;
    audit: WriteAudit;
    payload?: DocumentOpPayload;
    clientId?: string;
    clientSeq?: number;
  },
): Promise<{ serverVersion: number } | null> {
  return storage.recordDocumentOp({
    ...input,
    payload: input.payload as Record<string, unknown> | undefined,
  });
}
