import "./index.css";
import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AuthBar } from "./core/components/AuthBar";
import { AdminPlatformView } from "./platform/admin-platform-view";
import { CatalogUiShell } from "./platform/catalog-ui-shell";
import { initBrowserObservability } from "./platform/browser-observability";
import { useAppPageLoader } from "./platform/use-app-page-loader";
import { useAppRoute } from "./platform/use-app-route";
import { isLoginTemplate } from "./platform-routes";

function AppShell({
  children,
  template,
  lockViewport,
}: Readonly<{ children: ReactNode; template: string; lockViewport?: boolean }>) {
  return <div className={appShellClassName(template, lockViewport)}>{children}</div>;
}

function appShellClassName(template: string, lockViewport?: boolean): string {
  if (lockViewport) return "flex h-dvh flex-col overflow-hidden bg-background";
  if (isLoginTemplate(template)) return "noname-auth flex h-dvh flex-col overflow-hidden";
  return "min-h-screen bg-background";
}

const EditPageView = lazy(() => import("./editor").then((m) => ({ default: m.EditPageView })));

function App() {
  const route = useAppRoute();
  const { storeSlug, pathname, template, adminRoute } = route;
  const page = useAppPageLoader(route);
  const {
    spec,
    composeMode,
    adminPanelSpec,
    adminBaseShellProps,
    registry,
    shellKey,
    layoutTemplateName,
    pageContentRef,
    editorShellSpec,
    layoutRenderAs,
    error,
    loading,
    navigating,
    loadPage,
  } = page;
  const panelRoute = composeMode === "panel";

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const hasContent = spec !== null || adminBaseShellProps !== null;

  if (loading && !hasContent) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  if (error && !hasContent) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-destructive">
          Error: {error}
        </div>
      </AppShell>
    );
  }

  if (!hasContent || !storeSlug) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground">
          No spec found
        </div>
      </AppShell>
    );
  }

  const shellRouteKey = shellKey || `${template}:${pathname}`;

  const storefrontRoute = route.platformRoute === false;
  const editorRoute = layoutRenderAs === "editor";

  let mainContent: ReactNode = null;
  if (panelRoute && adminBaseShellProps) {
    mainContent = (
      <AdminPlatformView
        key="admin"
        baseShellProps={adminBaseShellProps}
        panelSpec={adminPanelSpec}
        panelKey={template}
        registry={registry}
      />
    );
  } else if (editorRoute && spec && editorShellSpec && layoutTemplateName) {
    mainContent = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<p className="p-8 text-muted-foreground">Loading editor…</p>}>
          <EditPageView
            displaySpec={spec}
            shellSpec={editorShellSpec}
            templateName={layoutTemplateName}
            pageContentRef={pageContentRef}
            registry={registry}
            onReload={() => void loadPage()}
          />
        </Suspense>
      </div>
    );
  } else if (spec) {
    mainContent = (
      <div
        className={
          isLoginTemplate(template) ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined
        }
      >
        <CatalogUiShell key={shellRouteKey} spec={spec} registry={registry} />
      </div>
    );
  }

  return (
    <AppShell template={template} lockViewport={editorRoute}>
      {!adminRoute && storefrontRoute ? <AuthBar onAuthChange={() => void loadPage()} /> : null}
      {error ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {navigating && !adminRoute ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary"
            role="progressbar"
            aria-label="Loading page"
          />
        ) : null}
        {mainContent}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  if (window.location.pathname === "/auth/callback") {
    import("./auth/callback-page").then(({ AuthCallbackPage }) => {
      createRoot(root).render(<AuthCallbackPage />);
    });
  } else {
    void initBrowserObservability();
    createRoot(root).render(<App />);
  }
}
