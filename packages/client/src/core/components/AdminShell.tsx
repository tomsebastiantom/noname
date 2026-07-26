import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import type { ComponentCtx } from "./types";

export function AdminShell({
  props,
  children,
}: ComponentCtx<{
  title: string;
  description?: string | null;
  activeNav: string;
}>) {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminNav activeNav={props.activeNav} />
      <main className="flex flex-1 flex-col">
        <AdminPageHeader title={props.title} description={props.description} />
        <div className="flex-1 p-8">{children as ReactNode}</div>
      </main>
    </div>
  );
}
