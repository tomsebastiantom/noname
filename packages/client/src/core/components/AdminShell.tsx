import type { ReactNode } from "react";
import { clearSession, isLoggedIn } from "../../auth/session";
import { Button } from "../../components/ui/button";
import { Separator } from "../../components/ui/separator";
import type { ComponentCtx } from "./types";

const NAV_ITEMS = [
  { id: "home", label: "Overview", href: "/admin" },
  { id: "pages", label: "Pages", href: "/admin/pages" },
  { id: "content", label: "Content", href: "/admin/content" },
  { id: "layout", label: "Layouts", href: "/admin/layout" },
] as const;

const SETTINGS_ITEMS = [
  { id: "auth", label: "Auth settings", href: "/admin/settings/auth" },
  { id: "users", label: "Team members", href: "/admin/settings/users" },
  { id: "login", label: "Login appearance", href: "/admin/settings/login" },
] as const;

function navLinkClass(active: boolean): string {
  return active
    ? "rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm"
    : "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground";
}

export function AdminShell({
  props,
  children,
}: ComponentCtx<{
  title: string;
  description?: string | null;
  activeNav: string;
}>) {
  const loggedIn = isLoggedIn();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30">
        <div className="px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</p>
          <h1 className="mt-1 text-lg font-semibold">Noname</h1>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={item.href} className={navLinkClass(props.activeNav === item.id)}>
              {item.label}
            </a>
          ))}

          <p className="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </p>
          {SETTINGS_ITEMS.map((item) => (
            <a key={item.id} href={item.href} className={navLinkClass(props.activeNav === item.id)}>
              {item.label}
            </a>
          ))}

          <a href="/account/security" className={navLinkClass(false)}>
            Account security
          </a>
          <a
            href="/"
            className="mt-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground"
          >
            ← Storefront
          </a>
        </nav>
        <Separator />
        <div className="p-3">
          {loggedIn ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                clearSession();
                window.location.href = "/login";
              }}
            >
              Sign out
            </Button>
          ) : (
            <a
              href="/login"
              className="block rounded-md px-3 py-2 text-sm font-medium text-primary hover:underline"
            >
              Sign in
            </a>
          )}
        </div>
      </aside>
      <main className="flex flex-1 flex-col">
        <header className="border-b px-8 py-5">
          <h2 className="text-2xl font-semibold tracking-tight">{props.title}</h2>
          {props.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
          ) : null}
        </header>
        <div className="flex-1 p-8">{children as ReactNode}</div>
      </main>
    </div>
  );
}
