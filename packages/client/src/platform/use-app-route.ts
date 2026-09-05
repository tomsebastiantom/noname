import { storeSlugFromHost } from "@noname/shared";
import { useSyncExternalStore } from "react";
import { resolveRoute } from "../platform-routes";
import { getPathname, subscribeAppLocation } from "./app-navigation";

export interface AppRouteState {
  storeSlug: string | null;
  pathname: string;
  platformRoute: boolean;
  template: string;
  adminRoute: boolean;
  editMode: boolean;
}

/** Route resolution for App: pathname subscription + platform/storefront branch + guards inputs. */
export function useAppRoute(): AppRouteState {
  const pathname = useSyncExternalStore(subscribeAppLocation, getPathname, getPathname);
  const route = resolveRoute(pathname);
  const platformRoute = route.kind === "platform";
  const template = platformRoute ? route.template : "storefront";
  const adminRoute = route.kind === "platform" ? route.requiresAuth : false;
  const editMode = new URLSearchParams(window.location.search).get("edit") === "true";
  const storeSlug = storeSlugFromHost(window.location.hostname);
  return { storeSlug, pathname, platformRoute, template, adminRoute, editMode };
}
