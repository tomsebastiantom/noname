import { useEffect, useState } from "react";
import {
  formatDocumentActivity,
  pickActivityOp,
  type DocumentActivityLabels,
} from "../../documents/format-document-activity";
import { listDocumentOps } from "../../documents/document-ops";

const POLL_MS = 30_000;

export function useDocumentActivity(
  documentId: string | null | undefined,
  labels: DocumentActivityLabels | null,
  refreshKey: number,
  opts?: { enabled?: boolean },
): string | null {
  const [activity, setActivity] = useState<string | null>(null);
  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (!documentId || !labels || !enabled) {
      setActivity(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const { ops } = await listDocumentOps(documentId, { limit: 10 });
        if (cancelled) return;
        const latest = pickActivityOp(ops);
        setActivity(latest ? formatDocumentActivity(latest, labels) : null);
      } catch {
        if (!cancelled) setActivity(null);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [documentId, labels, refreshKey, enabled]);

  return activity;
}
