import type { ContentTypeSchema } from "@noname/documents";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatApiError } from "../../lib/api";
import {
  CONTENT_DEFAULT_LOCALE,
  getContentType,
  loadEntryFields,
  publishContentEntry,
  saveContentEntry,
} from "../content-entries";
import { parseContentRef } from "../content-ref";

export function useContentDraft(pageContentRef: string | null, locale = CONTENT_DEFAULT_LOCALE) {
  const parsed = useMemo(
    () => (pageContentRef ? parseContentRef(pageContentRef) : null),
    [pageContentRef],
  );
  const [schema, setSchema] = useState<ContentTypeSchema | null>(null);
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(Boolean(parsed));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!parsed) {
      setSchema(null);
      setBaseline({});
      setValues({});
      setLoading(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const typeDef = await getContentType(parsed.contentType);
        if (!typeDef) {
          throw new Error(`Content type "${parsed.contentType}" not found`);
        }
        const fields = await loadEntryFields(parsed.contentType, parsed.entryId, locale);
        if (cancelled) return;
        setSchema(typeDef.schema);
        setBaseline(fields);
        setValues(fields);
      } catch (err) {
        if (!cancelled) {
          setLoadError(formatApiError(err, "Could not load page content"));
          setSchema(null);
          setBaseline({});
          setValues({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parsed, locale]);

  const dirty = useMemo(() => {
    if (!parsed) return false;
    return JSON.stringify(values) !== JSON.stringify(baseline);
  }, [parsed, values, baseline]);

  const updateField = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveContent = useCallback(async () => {
    if (!parsed || !schema) return;
    await saveContentEntry({
      contentType: parsed.contentType,
      id: parsed.entryId,
      schema,
      values,
      locale,
    });
    setBaseline({ ...values });
  }, [parsed, schema, values, locale]);

  const publishContent = useCallback(async () => {
    if (!parsed) return;
    await publishContentEntry(parsed.contentType, parsed.entryId);
  }, [parsed]);

  const discardContent = useCallback(() => {
    setValues({ ...baseline });
  }, [baseline]);

  const restoreValues = useCallback((next: Record<string, string>) => {
    setValues({ ...next });
  }, []);

  return {
    parsed,
    schema,
    values,
    loading,
    loadError,
    dirty,
    updateField,
    saveContent,
    publishContent,
    discardContent,
    restoreValues,
  };
}
