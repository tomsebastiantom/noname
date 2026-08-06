import type { Spec } from "@json-render/core";
import type { ContentTypeSchema } from "@noname/documents";
import { useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { mediaFieldLabelsSchema } from "../../../schemas/shared";
import { ContentEntryFieldInput } from "../../content-fields";
import { editMetaForType } from "../../lib/edit-metadata";
import {
  canRemoveElement,
  getElement,
  getPropPath,
  isStateBinding,
  patchElementField,
} from "../../lib/spec-utils";
import type { EditFieldDef, EditSelection, PendingBlockAdd } from "../../lib/types";
import type { EditorShellLabels } from "../../schemas/components";
import { EditorFieldControl } from "./EditorFieldControl";

function cmsStateKey(fieldPath: string): string | null {
  const match = /^config\.(.+)$/.exec(fieldPath);
  return match?.[1] ?? null;
}

export type ContentDraftEditor = {
  values: Record<string, string>;
  contentType: string | null;
  contentRef: string | null;
  schema: ContentTypeSchema | null;
  locale: string;
  loading: boolean;
  onFieldChange: (key: string, value: string) => void;
  onFieldFocus?: (field: { key: string; type: string; label: string }) => void;
};

function contentFieldForKey(
  schema: ContentTypeSchema | null,
  key: string,
): ContentTypeSchema["fields"][number] | null {
  return schema?.fields.find((field) => field.key === key) ?? null;
}

function FieldSourceBadge({
  source,
  labels,
}: Readonly<{ source: "layout" | "content"; labels: EditorShellLabels }>) {
  if (source === "content") {
    return (
      <Badge variant="success" className="shrink-0">
        {labels.contentBadgeLabel}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0">
      {labels.layoutBadgeLabel}
    </Badge>
  );
}

function FieldLabelRow({
  field,
  source,
  elementId,
  labels,
}: Readonly<{
  field: EditFieldDef;
  source: "layout" | "content";
  elementId: string;
  labels: EditorShellLabels;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={`${elementId}-${field.path}`}>{field.label}</Label>
      <FieldSourceBadge source={source} labels={labels} />
    </div>
  );
}

function layoutFieldDisplayValue(storedRaw: unknown): string {
  if (typeof storedRaw === "boolean") return String(storedRaw);
  if (storedRaw === null || storedRaw === undefined) return "";
  return String(storedRaw);
}

function PropsPanelFooter({
  isPending,
  saving,
  storedSpec,
  elementId,
  shellLabels,
  onCancelPending,
  onDuplicate,
  onDelete,
}: Readonly<{
  isPending: boolean;
  saving: boolean;
  storedSpec: Spec;
  elementId: string;
  shellLabels: EditorShellLabels;
  onCancelPending: () => void;
  onDuplicate?: (elementId: string) => void;
  onDelete: (elementId: string) => void;
}>) {
  if (isPending) {
    return (
      <div className="border-t pt-4 space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={saving}
          onClick={onCancelPending}
        >
          {shellLabels.propsCancelLabel}
        </Button>
      </div>
    );
  }
  if (!canRemoveElement(storedSpec, elementId)) return null;

  return (
    <div className="border-t pt-4 space-y-2">
      {onDuplicate ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onDuplicate(elementId)}
        >
          {shellLabels.propsDuplicateLabel}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() => onDelete(elementId)}
      >
        {shellLabels.propsRemoveLabel}
      </Button>
      <p className="mt-1.5 text-xs text-muted-foreground">{shellLabels.propsRemoveHelp}</p>
    </div>
  );
}

export function PropsPanel({
  selection,
  storedSpec,
  pendingAdd,
  contentDraft,
  shellLabels,
  onChangeSpec,
  onPatchPending,
  onSavePending,
  onCancelPending,
  onDelete,
  onDuplicate,
}: {
  selection: EditSelection | null;
  storedSpec: Spec | null;
  pendingAdd: PendingBlockAdd | null;
  contentDraft: ContentDraftEditor;
  shellLabels: EditorShellLabels;
  onChangeSpec: (spec: Spec) => void;
  onPatchPending: (fieldPath: string, value: unknown) => void;
  onSavePending: () => Promise<void>;
  onCancelPending: () => void;
  onDelete: (elementId: string) => void;
  onDuplicate?: (elementId: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  if (!selection || !storedSpec) {
    return (
      <aside className="editor-props-panel h-full w-full overflow-y-auto overscroll-contain bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">{shellLabels.propsSelectBlockHint}</p>
      </aside>
    );
  }

  const isPending =
    pendingAdd !== null &&
    (selection.elementId === pendingAdd.tempElementId ||
      (selection.componentType === pendingAdd.componentType &&
        !getElement(storedSpec, selection.elementId)));
  const meta = editMetaForType(
    isPending && pendingAdd ? pendingAdd.componentType : selection.componentType,
  );

  if (!isPending) {
    const el = getElement(storedSpec, selection.elementId);
    if (!el) {
      return (
        <aside className="editor-props-panel h-full w-full overflow-y-auto overscroll-contain bg-muted/20 p-4">
          <p className="text-sm text-destructive">{shellLabels.propsElementMissing}</p>
        </aside>
      );
    }
  }

  if (!meta) {
    return (
      <aside className="editor-props-panel h-full w-full overflow-y-auto overscroll-contain bg-muted/20 p-4 space-y-2">
        <h2 className="text-sm font-semibold">{selection.componentType}</h2>
        <p className="text-sm text-muted-foreground">{shellLabels.propsNoFieldsHint}</p>
      </aside>
    );
  }

  const propsSource =
    isPending && pendingAdd
      ? (pendingAdd.props as Record<string, unknown>)
      : ((getElement(storedSpec, selection.elementId)?.props ?? {}) as Record<string, unknown>);

  return (
    <aside className="editor-props-panel h-full w-full overflow-y-auto overscroll-contain bg-muted/20 p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{meta.label}</h2>
        {isPending ? (
          <p className="text-xs text-muted-foreground">{shellLabels.propsPendingHint}</p>
        ) : (
          <p className="text-xs text-muted-foreground" title={`elements.${selection.elementId}`}>
            {selection.componentType} {shellLabels.propsBlockSuffix}
          </p>
        )}
      </div>

      {isPending ? (
        <div className="space-y-2">
          <Button
            type="button"
            className="w-full"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSavePending().finally(() => setSaving(false));
            }}
          >
            {saving ? shellLabels.propsSavingLabel : shellLabels.propsSaveToPageLabel}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {shellLabels.propsSaveToPageHelp}
          </p>
        </div>
      ) : null}

      {meta.fields.map((field) => {
        const storedRaw = getPropPath(propsSource, field.path);
        const cmsBound = isStateBinding(storedRaw);
        const stateKey = cmsBound ? cmsStateKey(field.path) : null;

        if (cmsBound && stateKey) {
          return (
            <CmsFieldInput
              key={field.path}
              field={field}
              elementId={selection.elementId}
              stateKey={stateKey}
              contentDraft={contentDraft}
              shellLabels={shellLabels}
            />
          );
        }

        const displayValue = layoutFieldDisplayValue(storedRaw);

        return (
          <LayoutFieldInput
            key={field.path}
            field={field}
            elementId={selection.elementId}
            displayValue={displayValue}
            isPending={isPending}
            storedSpec={storedSpec}
            shellLabels={shellLabels}
            onChangeSpec={onChangeSpec}
            onPatchPending={onPatchPending}
          />
        );
      })}

      <PropsPanelFooter
        isPending={isPending}
        saving={saving}
        storedSpec={storedSpec}
        elementId={selection.elementId}
        shellLabels={shellLabels}
        onCancelPending={onCancelPending}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </aside>
  );
}

function CmsFieldInput({
  field,
  elementId,
  stateKey,
  contentDraft,
  shellLabels,
}: {
  field: EditFieldDef;
  elementId: string;
  stateKey: string;
  contentDraft: ContentDraftEditor;
  shellLabels: EditorShellLabels;
}) {
  if (!contentDraft.contentRef) {
    return (
      <div className="space-y-1.5">
        <FieldLabelRow field={field} source="content" elementId={elementId} labels={shellLabels} />
        <p className="text-xs text-muted-foreground">{shellLabels.propsNoContentRef}</p>
      </div>
    );
  }

  if (contentDraft.loading) {
    return (
      <div className="space-y-1.5">
        <FieldLabelRow field={field} source="content" elementId={elementId} labels={shellLabels} />
        <p className="text-xs text-muted-foreground">{shellLabels.propsLoadingContent}</p>
      </div>
    );
  }

  const displayValue = contentDraft.values[stateKey] ?? "";
  const cmsField = contentFieldForKey(contentDraft.schema, stateKey);
  const mediaLabels = mediaFieldLabelsSchema.parse(shellLabels);

  return (
    <div className="space-y-1.5">
      {cmsField ? (
        <>
          <FieldSourceBadge source="content" labels={shellLabels} />
          <p className="text-xs text-muted-foreground">{shellLabels.propsFieldSaveHint}</p>
          <ContentEntryFieldInput
            field={cmsField}
            value={displayValue}
            locale={contentDraft.locale}
            mediaLabels={mediaLabels}
            contentDocumentId={contentDraft.contentRef}
            onChange={(value) => contentDraft.onFieldChange(stateKey, value)}
            onFieldFocus={() =>
              contentDraft.onFieldFocus?.({
                key: stateKey,
                type: cmsField.type,
                label: cmsField.label,
              })
            }
          />
        </>
      ) : (
        <>
          <FieldLabelRow
            field={field}
            source="content"
            elementId={elementId}
            labels={shellLabels}
          />
          <p className="text-xs text-muted-foreground">{shellLabels.propsFieldSaveHint}</p>
          <EditorFieldControl
            field={field}
            elementId={elementId}
            displayValue={displayValue}
            shellLabels={shellLabels}
            onValueChange={(val) =>
              contentDraft.onFieldChange(stateKey, val === null ? "" : String(val))
            }
          />
        </>
      )}
    </div>
  );
}

function LayoutFieldInput({
  field,
  elementId,
  displayValue,
  isPending,
  storedSpec,
  shellLabels,
  onChangeSpec,
  onPatchPending,
}: {
  field: EditFieldDef;
  elementId: string;
  displayValue: string;
  isPending: boolean;
  storedSpec: Spec;
  shellLabels: EditorShellLabels;
  onChangeSpec: (spec: Spec) => void;
  onPatchPending: (fieldPath: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabelRow field={field} source="layout" elementId={elementId} labels={shellLabels} />
      <p className="text-xs text-muted-foreground">{shellLabels.propsFieldSaveHint}</p>
      <EditorFieldControl
        field={field}
        elementId={elementId}
        displayValue={displayValue}
        shellLabels={shellLabels}
        onValueChange={(val) => {
          if (isPending) onPatchPending(field.path, val);
          else onChangeSpec(patchElementField(storedSpec, elementId, field.path, val));
        }}
      />
    </div>
  );
}
