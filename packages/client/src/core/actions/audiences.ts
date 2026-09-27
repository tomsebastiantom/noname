import { isAggregateAudienceMetrics } from "../../admin/audience-authoring";
import {
  activateAudienceVersion,
  activateExperienceBinding,
  archiveAudience,
  createAudience,
  createAudienceVersion,
  createExperienceBinding,
  fetchAudiencePerformance,
  listActivityTypes,
  listAudiences,
  listExperienceBindings,
  validateAudienceVersion,
} from "../../admin/audiences";
import type { LayoutRow } from "../../documents/layout-entries";
import { apiFetchData } from "../../lib/api";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler, CatalogSetState } from "./types";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function refreshDefinitions(setState: CatalogSetState): Promise<void> {
  setState(ADMIN_STATE.audiences.definitions, await listAudiences());
}

export const audienceActions = {
  loadAudiencesAdmin: (async (_params, setState) => {
    setState(ADMIN_STATE.audiences.loading, true);
    setState(ADMIN_STATE.audiences.error, null);
    try {
      const [definitions, activityTypes] = await Promise.all([
        listAudiences(),
        listActivityTypes(),
      ]);
      setState(ADMIN_STATE.audiences.definitions, definitions);
      setState(ADMIN_STATE.audiences.activityTypes, activityTypes);
    } catch (error) {
      setState(ADMIN_STATE.audiences.definitions, []);
      setState(ADMIN_STATE.audiences.activityTypes, []);
      setState(ADMIN_STATE.audiences.error, message(error));
    } finally {
      setState(ADMIN_STATE.audiences.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadAudienceBindings: (async (params, setState) => {
    const { audienceKey } = params as { audienceKey: string };
    setState(ADMIN_STATE.audiences.error, null);
    setState(ADMIN_STATE.audiences.performance, null);
    try {
      const [bindings, layoutRows] = await Promise.all([
        listExperienceBindings(audienceKey),
        apiFetchData<LayoutRow[]>("/api/documents/layout"),
      ]);
      setState(ADMIN_STATE.audiences.bindings, bindings);
      // Only published finite variants are selectable; drafts cannot be targeted.
      setState(
        ADMIN_STATE.audiences.layouts,
        layoutRows
          .filter((layout) => layout.status === "published")
          .map((layout) => ({
            templateName: layout.key,
            segment: layout.segment,
            status: layout.status,
            id: layout.id,
            hasContentRef: Boolean(layout.data.contentRef),
          })),
      );
    } catch (error) {
      setState(ADMIN_STATE.audiences.bindings, []);
      setState(ADMIN_STATE.audiences.layouts, []);
      setState(ADMIN_STATE.audiences.error, message(error));
    }
  }) satisfies CatalogActionHandler,

  createAudience: (async (params, setState) => {
    const { key } = params as { key: string };
    await createAudience(key);
    await refreshDefinitions(setState);
  }) satisfies CatalogActionHandler,

  createAudienceVersion: (async (params, setState) => {
    const { audienceKey, ...input } = params as {
      audienceKey: string;
      activityType: string;
      activityVersion: number;
      condition: unknown;
      action: "assign" | "remove";
      expiry: { afterMs: number } | { untilRevoked: true };
    };
    await createAudienceVersion(audienceKey, input as Parameters<typeof createAudienceVersion>[1]);
    await refreshDefinitions(setState);
    setState(ADMIN_STATE.audiences.validation, null);
  }) satisfies CatalogActionHandler,

  validateAudienceVersion: (async (params, setState) => {
    const { audienceKey, version } = params as { audienceKey: string; version: number };
    setState(ADMIN_STATE.audiences.error, null);
    setState(ADMIN_STATE.audiences.validation, null);
    try {
      const result = await validateAudienceVersion(audienceKey, version);
      setState(ADMIN_STATE.audiences.validation, { ...result, audienceKey, version });
    } catch (error) {
      setState(ADMIN_STATE.audiences.error, message(error));
      throw error;
    }
  }) satisfies CatalogActionHandler,

  activateAudienceVersion: (async (params, setState) => {
    const { audienceKey, version } = params as { audienceKey: string; version: number };
    await activateAudienceVersion(audienceKey, version);
    await refreshDefinitions(setState);
  }) satisfies CatalogActionHandler,

  archiveAudience: (async (params, setState) => {
    const { audienceKey } = params as { audienceKey: string };
    await archiveAudience(audienceKey);
    await refreshDefinitions(setState);
  }) satisfies CatalogActionHandler,

  createAudienceBinding: (async (params, setState) => {
    const { audienceKey, input } = params as {
      audienceKey: string;
      input: Parameters<typeof createExperienceBinding>[1];
    };
    await createExperienceBinding(audienceKey, input);
    setState(ADMIN_STATE.audiences.bindings, await listExperienceBindings(audienceKey));
  }) satisfies CatalogActionHandler,

  activateAudienceBinding: (async (params, setState) => {
    const { audienceKey, version } = params as { audienceKey: string; version: number };
    await activateExperienceBinding(audienceKey, version);
    setState(ADMIN_STATE.audiences.bindings, await listExperienceBindings(audienceKey));
  }) satisfies CatalogActionHandler,

  loadAudiencePerformance: (async (params, setState) => {
    const { audienceKey } = params as { audienceKey: string };
    try {
      const summary = await fetchAudiencePerformance(audienceKey);
      setState(
        ADMIN_STATE.audiences.performance,
        isAggregateAudienceMetrics(summary) ? summary : null,
      );
    } catch (error) {
      setState(ADMIN_STATE.audiences.performance, null);
      // Performance is intentionally optional; an absent endpoint does not block admin work.
      if (!(error instanceof Error && error.message.includes("404"))) {
        setState(ADMIN_STATE.audiences.error, message(error));
      }
    }
  }) satisfies CatalogActionHandler,
};
