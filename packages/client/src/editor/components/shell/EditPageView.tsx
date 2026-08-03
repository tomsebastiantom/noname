import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { EditorGate } from "../../../platform/editor-gate";
import { EditorSessionProvider } from "../../hooks/editor-session";
import { useEditPageOrchestration } from "../../hooks/use-edit-page-orchestration";
import { EditorPrefsProvider } from "../../hooks/use-editor-prefs";
import { editorRegistry } from "../../registry";

function EditPageBody({
  shellLabelsLoading,
  shellLabelsMissing,
  sessionData,
  mergedShellSpec,
  labelsMissingMessage,
  layoutLoading,
  storedSpec,
  templateName,
  registry,
  editorShellStore,
  sessionActions,
  editorActionHandlers,
}: Readonly<{
  shellLabelsLoading: boolean;
  shellLabelsMissing: boolean;
  sessionData: ReturnType<typeof useEditPageOrchestration>["sessionData"];
  mergedShellSpec: Spec | null;
  labelsMissingMessage: string;
  layoutLoading: boolean;
  storedSpec: Spec | null;
  templateName: string;
  registry: ComponentRegistry;
  editorShellStore: ReturnType<typeof useEditPageOrchestration>["editorShellStore"];
  sessionActions: ReturnType<typeof useEditPageOrchestration>["sessionActions"];
  editorActionHandlers: ReturnType<typeof useEditPageOrchestration>["editorActionHandlers"];
}>) {
  if (shellLabelsLoading) {
    return <p className="p-8 text-muted-foreground" aria-busy="true" />;
  }
  if (shellLabelsMissing || !sessionData || !mergedShellSpec) {
    return <p className="p-8 text-destructive">{labelsMissingMessage}</p>;
  }
  if (layoutLoading && !storedSpec) {
    return <p className="p-8 text-muted-foreground">{sessionData.shellLabels.loadingLayoutHint}</p>;
  }

  return (
    <EditorSessionProvider data={sessionData} actions={sessionActions}>
      <EditorPrefsProvider templateName={templateName} registry={registry}>
        <JSONUIProvider
          registry={editorRegistry}
          store={editorShellStore}
          handlers={editorActionHandlers}
        >
          <Renderer spec={mergedShellSpec} registry={editorRegistry} />
        </JSONUIProvider>
      </EditorPrefsProvider>
    </EditorSessionProvider>
  );
}

export function EditPageView({
  displaySpec,
  shellSpec,
  templateName,
  pageContentRef,
  registry,
  onReload,
}: Readonly<{
  displaySpec: Spec;
  shellSpec: Spec;
  templateName: string;
  pageContentRef: string | null;
  registry: ComponentRegistry;
  onReload: () => void;
}>) {
  const orchestration = useEditPageOrchestration({
    displaySpec,
    templateName,
    pageContentRef,
    registry,
    onReload,
    shellSpec,
  });

  return (
    <EditorGate>
      <EditPageBody
        shellLabelsLoading={orchestration.shellLabelsLoading}
        shellLabelsMissing={orchestration.shellLabelsMissing}
        sessionData={orchestration.sessionData}
        mergedShellSpec={orchestration.mergedShellSpec}
        labelsMissingMessage={orchestration.labelsMissingMessage}
        layoutLoading={orchestration.layoutLoading}
        storedSpec={orchestration.storedSpec}
        templateName={templateName}
        registry={registry}
        editorShellStore={orchestration.editorShellStore}
        sessionActions={orchestration.sessionActions}
        editorActionHandlers={orchestration.editorActionHandlers}
      />
    </EditorGate>
  );
}
