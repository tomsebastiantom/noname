export type EvidenceOrderRecord = {
  id: string;
  subjectId: string;
  data: Record<string, unknown>;
  occurredAt: string;
};

export async function fetchCommerceOrders(limit = 50): Promise<EvidenceOrderRecord[]> {
  const params = new URLSearchParams({ type: "commerce.order.created", limit: String(limit) });
  const body = await fetchEvidence<{ data?: EvidenceOrderRecord[] }>(
    `/api/evidence/records?${params.toString()}`,
  );
  return body.data ?? [];
}

export async function fetchCommerceEvidenceLinks(recordId: string) {
  const body = await fetchEvidence<{ data?: Array<Record<string, unknown>> }>(
    `/api/evidence/links/${encodeURIComponent(recordId)}`,
  );
  return body.data ?? [];
}

async function fetchEvidence<T>(path: string): Promise<T> {
  const token = sessionStorage.getItem("noname:access_token");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(path, { headers });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Orders are not available for this account");
    }
    throw new Error(`Evidence request failed (${response.status})`);
  }
  return (await response.json()) as T;
}
