import { apiFetch } from "../lib/api";

export type EvidenceOrderRecord = {
  id: string;
  type: string;
  subjectType: string;
  subjectId: string;
  data: Record<string, unknown>;
  occurredAt: string;
  recordedAt: string;
};

export async function fetchCommerceOrders(limit = 50): Promise<EvidenceOrderRecord[]> {
  const params = new URLSearchParams({ type: "commerce.order.created", limit: String(limit) });
  const body = await apiFetch<{ data?: EvidenceOrderRecord[] }>(
    `/api/evidence/records?${params.toString()}`,
  );
  return body.data ?? [];
}

export async function fetchEvidenceLinks(recordId: string) {
  const body = await apiFetch<{ data?: Array<Record<string, unknown>> }>(
    `/api/evidence/links/${encodeURIComponent(recordId)}`,
  );
  return body.data ?? [];
}
