import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { useDeferredValue } from "react";
import { EditPageView } from "../editor/components/shell/EditPageView";

/**
 * Stable editor host — shell stays mounted; page props defer so the previous
 * page stays visible until the next edge response is ready (mirrors admin soft nav).
 */
export function EditorPlatformView({
  shellSpec,
  displaySpec,
  templateName,
  pageContentRef,
  registry,
  onReload,
}: Readonly<{
  shellSpec: Spec;
  displaySpec: Spec;
  templateName: string;
  pageContentRef: string | null;
  registry: ComponentRegistry;
  onReload: () => void;
}>) {
  const deferredDisplaySpec = useDeferredValue(displaySpec);
  const deferredTemplateName = useDeferredValue(templateName);
  const deferredPageContentRef = useDeferredValue(pageContentRef);
  const isStale =
    deferredDisplaySpec !== displaySpec ||
    deferredTemplateName !== templateName ||
    deferredPageContentRef !== pageContentRef;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {isStale ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary/70"
          aria-hidden
        />
      ) : null}
      <EditPageView
        displaySpec={deferredDisplaySpec}
        shellSpec={shellSpec}
        templateName={deferredTemplateName}
        pageContentRef={deferredPageContentRef}
        registry={registry}
        onReload={onReload}
      />
    </div>
  );
}
