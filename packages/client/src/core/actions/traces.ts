import { fetchTraceDetail, fetchTraces } from "../../admin/traces";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export const tracesActions = {
  loadTracesAdmin: (async (_params, setState) => {
    setState(ADMIN_STATE.traces.loading, true);
    setState(ADMIN_STATE.traces.error, null);
    try {
      const traces = await fetchTraces(50, "1h");
      setState(ADMIN_STATE.traces.traces, traces);
      setState(ADMIN_STATE.traces.selectedTraceId, null);
      setState(ADMIN_STATE.traces.detailSpans, []);
    } catch (err) {
      setState(
        ADMIN_STATE.traces.error,
        err instanceof Error ? err.message : "Failed to load traces",
      );
      setState(ADMIN_STATE.traces.traces, []);
      setState(ADMIN_STATE.traces.detailSpans, []);
    } finally {
      setState(ADMIN_STATE.traces.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadTraceDetail: (async (params, setState) => {
    const traceId = String((params as { traceId?: string }).traceId ?? "");
    if (!traceId) return;
    setState(ADMIN_STATE.traces.detailLoading, true);
    setState(ADMIN_STATE.traces.detailError, null);
    try {
      const detail = await fetchTraceDetail(traceId);
      if (!detail) {
        setState(ADMIN_STATE.traces.detailError, "Trace not found");
        setState(ADMIN_STATE.traces.detailSpans, []);
        return;
      }
      setState(ADMIN_STATE.traces.selectedTraceId, traceId);
      setState(ADMIN_STATE.traces.detailSpans, detail.spans);
    } catch (err) {
      setState(
        ADMIN_STATE.traces.detailError,
        err instanceof Error ? err.message : "Failed to load trace detail",
      );
      setState(ADMIN_STATE.traces.detailSpans, []);
    } finally {
      setState(ADMIN_STATE.traces.detailLoading, false);
    }
  }) satisfies CatalogActionHandler,
};
