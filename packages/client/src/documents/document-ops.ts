import { apiFetch, unwrapData } from "../lib/api";
import { clientOpHeaders } from "../lib/client-op";
import type { DocumentOpPayload } from "./document-op-types";

export interface DocumentOpRow {
  id: string;
  orgId: string;
  documentId: string;
  serverVersion: number;
  operation: string;
  actorType: string;
  actorId: string;
  onBehalfOf: string | null;
  taskId: string | null;
  clientId: string | null;
  clientSeq: number | null;
  payload: DocumentOpPayload | null;
  createdAt: string;
}

export interface DocumentOpsResponse {
  documentId: string;
  ops: DocumentOpRow[];
}

export async function listDocumentOps(
  documentId: string,
  opts?: { fromVersion?: number; limit?: number },
): Promise<DocumentOpsResponse> {
  const params = new URLSearchParams();
  if (opts?.fromVersion !== undefined) {
    params.set("from_version", String(opts.fromVersion));
  }
  if (opts?.limit !== undefined) {
    params.set("limit", String(opts.limit));
  }
  const query = params.toString();
  const path = `/api/documents/document/${documentId}/ops${query ? `?${query}` : ""}`;
  const response = await apiFetch<{ data?: DocumentOpsResponse }>(path);
  return unwrapData(response);
}

export { clientOpHeaders };
