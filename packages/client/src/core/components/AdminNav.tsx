import { clearSession, isLoggedIn } from "../../auth/session";
import { Button } from "../../components/ui/button";
import { Separator } from "../../components/ui/separator";

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
};

export type AdminNavProps = {
  activeNav: string;
  sidebarTitle: string;
  productName: string;
  navItems: AdminNavItem[];
  settingsSectionLabel: string;
  settingsItems: AdminNavItem[];
  accountSecurityLabel: string;
  accountSecurityHref: string;
  storefrontLabel: string;
  storefrontHref: string;
  signOutLabel: string;
  signInLabel: string;
};

function navLinkClass(active: boolean): string {
  return active
    ? "rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm"
    : "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground";
}

export function AdminNav(props: AdminNavProps) {
  const loggedIn = isLoggedIn();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30">
      <div className="px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.sidebarTitle}
        </p>
        <h1 className="mt-1 text-lg font-semibold">{props.productName}</h1>
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {props.navItems.map((item) => (
          <a key={item.id} href={item.href} className={navLinkClass(props.activeNav === item.id)}>
            {item.label}
          </a>
        ))}

        <p className="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.settingsSectionLabel}
        </p>
        {props.settingsItems.map((item) => (
          <a key={item.id} href={item.href} className={navLinkClass(props.activeNav === item.id)}>
            {item.label}
          </a>
        ))}

        <a href={props.accountSecurityHref} className={navLinkClass(false)}>
          {props.accountSecurityLabel}
        </a>
        <a
          href={props.storefrontHref}
          className="mt-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground"
        >
          {props.storefrontLabel}
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
            {props.signOutLabel}
          </Button>
        ) : (
          <a
            href="/login"
            className="block rounded-md px-3 py-2 text-sm font-medium text-primary hover:underline"
          >
            {props.signInLabel}
          </a>
        )}
      </div>
    </aside>
  );
}
