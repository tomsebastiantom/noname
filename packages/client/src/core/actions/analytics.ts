import { fetchAnalyticsAggregations, fetchAnalyticsEvents } from "../../admin/analytics";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export const analyticsActions = {
  loadAnalyticsAdmin: (async (_params, setState) => {
    setState(ADMIN_STATE.analytics.loading, true);
    setState(ADMIN_STATE.analytics.error, null);
    try {
      const [events, aggregations] = await Promise.all([
        fetchAnalyticsEvents(50),
        fetchAnalyticsAggregations("eventType", 50),
      ]);
      setState(ADMIN_STATE.analytics.events, events);
      setState(ADMIN_STATE.analytics.aggregations, aggregations);
    } catch (err) {
      setState(
        ADMIN_STATE.analytics.error,
        err instanceof Error ? err.message : "Failed to load analytics",
      );
      setState(ADMIN_STATE.analytics.events, []);
      setState(ADMIN_STATE.analytics.aggregations, []);
    } finally {
      setState(ADMIN_STATE.analytics.loading, false);
    }
  }) satisfies CatalogActionHandler,
};
