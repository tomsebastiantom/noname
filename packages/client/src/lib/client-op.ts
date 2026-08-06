const CLIENT_ID_KEY = "noname-editor-client-id";

let clientSeq = 0;
let memoryClientId: string | null = null;

function readStoredClientId(): string | null {
  try {
    return sessionStorage.getItem(CLIENT_ID_KEY);
  } catch {
    return null;
  }
}

function writeStoredClientId(id: string): void {
  try {
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    // Private mode / blocked storage — still send per-tab seq without persistence.
  }
}

/** Stable tab session id for document_ops dedup (E3-pre). */
export function getEditorClientId(): string {
  const existing = readStoredClientId() ?? memoryClientId;
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeStoredClientId(id);
  memoryClientId = id;
  return id;
}

/** Monotonic save counter for this tab — paired with X-Client-Id. */
export function nextClientOpSeq(): number {
  clientSeq += 1;
  return clientSeq;
}

/** Headers to send on layout/content draft saves. */
export function clientOpHeaders(): Record<string, string> {
  return {
    "X-Client-Id": getEditorClientId(),
    "X-Client-Seq": String(nextClientOpSeq()),
  };
}

/** @internal test helper */
export function resetClientOpStateForTests(clientId?: string): void {
  clientSeq = 0;
  memoryClientId = clientId ?? null;
  try {
    if (clientId) {
      sessionStorage.setItem(CLIENT_ID_KEY, clientId);
    } else {
      sessionStorage.removeItem(CLIENT_ID_KEY);
    }
  } catch {
    // ignore
  }
}
