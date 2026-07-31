import {
  getLayoutForTemplate,
  type LayoutSummary,
  listLayouts,
  parseSpecJson,
  publishLayout,
  saveLayout,
  specToJson,
} from "../../admin/layout-entries";
import { extractLoginBranding, type LoginBrandingValues } from "../../admin/login-branding";
import { fetchAuthSessionStatus, PERMISSIONS, sessionHasPermission } from "../../auth/team-users";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export type LayoutAdminLoaded =
  | {
      mode: "list";
      loadedAt: number;
      layouts: LayoutSummary[];
      canPublish: boolean;
    }
  | {
      mode: "detail";
      loadedAt: number;
      templateName: string;
      segment: string;
      layoutId: string | null;
      status: string;
      specJson: string;
      contentRef: string;
      canPublish: boolean;
    };

export type LoginBrandingLoaded = {
  loadedAt: number;
  segment: string;
  layoutId: string;
  baseSpec: Record<string, unknown>;
  values: LoginBrandingValues;
  canPublish: boolean;
};

export const layoutActions = {
  loadLoginBranding: (async (params, setState) => {
    const { segment = "default" } = (params ?? {}) as { segment?: string };

    setState(ADMIN_STATE.loginBranding.loading, true);
    setState(ADMIN_STATE.loginBranding.error, null);

    try {
      const session = await fetchAuthSessionStatus().catch(() => null);
      const canPublish = sessionHasPermission(session, PERMISSIONS.LAYOUT_PUBLISH);
      const row = await getLayoutForTemplate("login", segment);
      if (!row) throw new Error('Login layout "login" not found — run pnpm seed:demo');

      const baseSpec = row.data.spec ?? { root: "", elements: {} };
      const loaded: LoginBrandingLoaded = {
        loadedAt: Date.now(),
        segment,
        layoutId: row.id,
        baseSpec,
        values: extractLoginBranding(baseSpec),
        canPublish,
      };
      setState(ADMIN_STATE.loginBranding.loaded, loaded);
    } catch (err) {
      setState(ADMIN_STATE.loginBranding.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.loginBranding.loaded, null);
    } finally {
      setState(ADMIN_STATE.loginBranding.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadLayoutAdmin: (async (params, setState) => {
    const { templateName = "", segment = "default" } = (params ?? {}) as {
      templateName?: string;
      segment?: string;
    };

    setState(ADMIN_STATE.layout.loading, true);
    setState(ADMIN_STATE.layout.error, null);

    try {
      const session = await fetchAuthSessionStatus().catch(() => null);
      const canPublish = sessionHasPermission(session, PERMISSIONS.LAYOUT_PUBLISH);

      if (!templateName) {
        const rows = await listLayouts(segment);
        const loaded: LayoutAdminLoaded = {
          mode: "list",
          loadedAt: Date.now(),
          layouts: rows,
          canPublish,
        };
        setState(ADMIN_STATE.layout.loaded, loaded);
        return;
      }

      const row = await getLayoutForTemplate(templateName, segment);
      const loaded: LayoutAdminLoaded = {
        mode: "detail",
        loadedAt: Date.now(),
        templateName,
        segment,
        layoutId: row?.id ?? null,
        status: row?.status ?? "draft",
        specJson: row ? specToJson(row.data.spec) : "",
        contentRef: row?.data.contentRef ?? "",
        canPublish,
      };
      setState(ADMIN_STATE.layout.loaded, loaded);
    } catch (err) {
      setState(ADMIN_STATE.layout.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.layout.loaded, null);
    } finally {
      setState(ADMIN_STATE.layout.loading, false);
    }
  }) satisfies CatalogActionHandler,

  saveLayoutEntry: (async (params) => {
    const { id, specJson, contentRef } = params as {
      id: string;
      specJson: string;
      contentRef?: string | null;
    };
    const spec = parseSpecJson(specJson);
    await saveLayout({ id, spec, contentRef });
  }) satisfies CatalogActionHandler,

  publishLayoutEntry: (async (params) => {
    const { id } = params as { id: string };
    await publishLayout(id);
  }) satisfies CatalogActionHandler,
};
