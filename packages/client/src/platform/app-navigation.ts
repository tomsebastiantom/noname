/** Client-side navigation without full document reload (admin / platform routes). */

export function getAppLocationPath(): string {
  return window.location.pathname + window.location.search;
}

export function navigateApp(path: string, options?: { replace?: boolean }): void {
  if (path === getAppLocationPath()) return;
  if (options?.replace) {
    history.replaceState(null, "", path);
  } else {
    history.pushState(null, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function subscribeAppLocation(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

export function getPathname(): string {
  return window.location.pathname;
}
