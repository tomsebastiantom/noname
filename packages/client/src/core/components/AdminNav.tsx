import { clearSession, isLoggedIn } from "../../auth/session";
import { Button } from "../../components/ui/button";
import { Separator } from "../../components/ui/separator";

export const ADMIN_NAV_ITEMS = [
  { id: "home", label: "Overview", href: "/admin" },
  { id: "pages", label: "Pages", href: "/admin/pages" },
  { id: "content", label: "Content", href: "/admin/content" },
  { id: "layout", label: "Layouts", href: "/admin/layout" },
] as const;

export const ADMIN_SETTINGS_ITEMS = [
  { id: "auth", label: "Auth settings", href: "/admin/settings/auth" },
  { id: "users", label: "Team members", href: "/admin/settings/users" },
  { id: "login", label: "Login appearance", href: "/admin/settings/login" },
] as const;

function navLinkClass(active: boolean): string {
  return active
    ? "rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm"
    : "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground";
}

export function AdminNav({ activeNav }: { activeNav: string }) {
  const loggedIn = isLoggedIn();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30">
      <div className="px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</p>
        <h1 className="mt-1 text-lg font-semibold">Noname</h1>
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {ADMIN_NAV_ITEMS.map((item) => (
          <a key={item.id} href={item.href} className={navLinkClass(activeNav === item.id)}>
            {item.label}
          </a>
        ))}

        <p className="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Settings
        </p>
        {ADMIN_SETTINGS_ITEMS.map((item) => (
          <a key={item.id} href={item.href} className={navLinkClass(activeNav === item.id)}>
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
  );
}
