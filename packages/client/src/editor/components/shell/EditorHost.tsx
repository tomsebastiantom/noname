import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { EditorGate } from "../../../platform/editor-gate";
import { EditPageView } from "./EditPageView";

/** Storefront edit mode host — wraps chunk error boundary + editor page. */
export function EditorHost({
  displaySpec,
  templateName,
  pageContentRef,
  registry,
  onReload,
}: Readonly<{
  displaySpec: Spec;
  templateName: string;
  pageContentRef: string | null;
  registry: ComponentRegistry;
  onReload: () => void;
}>) {
  return (
    <EditorGate>
      <EditPageView
        displaySpec={displaySpec}
        templateName={templateName}
        pageContentRef={pageContentRef}
        registry={registry}
        onReload={onReload}
      />
    </EditorGate>
  );
}
