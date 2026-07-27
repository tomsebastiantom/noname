import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { getPathname, subscribeAppLocation } from "../../platform/app-navigation";
import { adminActiveNavFromPath } from "../../platform-routes";
import { AdminNav, type AdminNavProps } from "./AdminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import type { ComponentCtx } from "./types";

export function AdminShell({
  props,
  children,
}: ComponentCtx<
  AdminNavProps & {
    title: string;
    description?: string | null;
  }
>) {
  const { title, description, ...navProps } = props;
  const pathname = useSyncExternalStore(subscribeAppLocation, getPathname, getPathname);
  const activeNav = adminActiveNavFromPath(pathname) || navProps.activeNav;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminNav {...navProps} activeNav={activeNav} />
      <main className="flex flex-1 flex-col">
        <AdminPageHeader title={title} description={description} />
        <div className="flex-1 p-8">{children as ReactNode}</div>
      </main>
    </div>
  );
}
