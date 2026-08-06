import type { Spec } from "@json-render/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthSessionStatus, PERMISSIONS, sessionHasPermission } from "../../auth/team-users";
import { formatApiError } from "../../lib/api";
import {
  getLayoutForTemplate,
  parseSpecJson,
  publishLayout,
  saveLayout,
  specToJson,
} from "../layout-entries";
import { cloneSpec } from "../lib/spec-utils";
import type { LayoutDraft } from "../lib/types";

export function useLayoutDraft(templateName: string, displaySpec: Spec, segment = "default") {
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [storedSpec, setStoredSpec] = useState<Spec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const displaySpecRef = useRef(displaySpec);
  displaySpecRef.current = displaySpec;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const session = await fetchAuthSessionStatus().catch(() => null);
        if (!cancelled) {
          setCanPublish(sessionHasPermission(session, PERMISSIONS.LAYOUT_PUBLISH));
        }

        const row = await getLayoutForTemplate(templateName, segment);
        if (!row) {
          throw new Error(`Layout "${templateName}" not found — run pnpm seed:demo`);
        }

        const spec = (row.data.spec ?? { root: "", elements: {} }) as unknown as Spec;
        const loaded: LayoutDraft = {
          layoutId: row.id,
          templateName,
          segment,
          contentRef: row.data.contentRef ?? null,
          status: row.status,
          storedSpec: spec,
          updatedAt: row.updatedAt,
        };
        if (!cancelled) {
          setDraft(loaded);
          setStoredSpec(cloneSpec(spec));
          setDirty(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(formatApiError(err, "Could not load layout for editing"));
          setDraft(null);
          setStoredSpec(cloneSpec(displaySpecRef.current));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateName, segment]);

  const updateStoredSpec = useCallback((next: Spec) => {
    setStoredSpec(next);
    setDirty(true);
  }, []);

  const saveDraft = useCallback(
    async (specOverride?: Spec) => {
      const specToSave = specOverride ?? storedSpec;
      if (!draft || !specToSave) throw new Error("No layout loaded");
      const spec = specToSave as unknown as Record<string, unknown>;
      parseSpecJson(specToJson(spec));
      const saved = await saveLayout({
        id: draft.layoutId,
        spec,
        contentRef: draft.contentRef,
        ifMatchUpdatedAt: draft.updatedAt,
      });
      setDirty(false);
      setDraft((d) =>
        d
          ? {
              ...d,
              status: "draft",
              storedSpec: cloneSpec(specToSave),
              updatedAt: saved.updatedAt,
            }
          : d,
      );
      setStoredSpec(cloneSpec(specToSave));
    },
    [draft, storedSpec],
  );

  const publishDraft = useCallback(
    async (specOverride?: Spec) => {
      const specToSave = specOverride ?? storedSpec;
      if (!draft || !specToSave) throw new Error("No layout loaded");
      const spec = specToSave as unknown as Record<string, unknown>;
      parseSpecJson(specToJson(spec));
      const saved = await saveLayout({
        id: draft.layoutId,
        spec,
        contentRef: draft.contentRef,
        ifMatchUpdatedAt: draft.updatedAt,
      });
      await publishLayout(draft.layoutId);
      setDirty(false);
      setDraft((d) =>
        d
          ? {
              ...d,
              status: "published",
              storedSpec: cloneSpec(specToSave),
              updatedAt: saved.updatedAt,
            }
          : d,
      );
      setStoredSpec(cloneSpec(specToSave));
    },
    [draft, storedSpec],
  );

  const discardChanges = useCallback(() => {
    if (draft) {
      setStoredSpec(cloneSpec(draft.storedSpec));
      setDirty(false);
    }
  }, [draft]);

  const reloadFromServer = useCallback(async (): Promise<Spec | null> => {
    const row = await getLayoutForTemplate(templateName, segment);
    if (!row) return null;
    const spec = (row.data.spec ?? { root: "", elements: {} }) as unknown as Spec;
    setDraft((current) =>
      current
        ? {
            ...current,
            status: row.status,
            storedSpec: cloneSpec(spec),
            updatedAt: row.updatedAt,
          }
        : current,
    );
    setStoredSpec(cloneSpec(spec));
    setDirty(false);
    return spec;
  }, [templateName, segment]);

  return useMemo(
    () => ({
      draft,
      storedSpec,
      loadError,
      loading,
      dirty,
      canPublish,
      updateStoredSpec,
      saveDraft,
      publishDraft,
      discardChanges,
      reloadFromServer,
    }),
    [
      draft,
      storedSpec,
      loadError,
      loading,
      dirty,
      canPublish,
      updateStoredSpec,
      saveDraft,
      publishDraft,
      discardChanges,
      reloadFromServer,
    ],
  );
}
