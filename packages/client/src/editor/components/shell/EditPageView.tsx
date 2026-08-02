import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { EditorSessionProvider } from "../../hooks/editor-session";
import { useEditPageOrchestration } from "../../hooks/use-edit-page-orchestration";
import { EditorPrefsProvider } from "../../hooks/use-editor-prefs";
import { editorRegistry } from "../../registry";

export function EditPageView({
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
  const {
    editorShellStore,
    sessionData,
    sessionActions,
    editorActionHandlers,
    mergedShellSpec,
    labelsMissingMessage,
    shellLabelsLoading,
    shellLabelsMissing,
    layoutLoading,
    storedSpec,
  } = useEditPageOrchestration({
    displaySpec,
    templateName,
    pageContentRef,
    registry,
    onReload,
  });

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
