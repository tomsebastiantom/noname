import type { ReactNode } from "react";
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

  return (
    <div className="flex min-h-screen bg-background">
      <AdminNav {...navProps} />
      <main className="flex flex-1 flex-col">
        <AdminPageHeader title={title} description={description} />
        <div className="flex-1 p-8">{children as ReactNode}</div>
      </main>
    </div>
  );
}
