import { useActions } from "@json-render/react";
import type { MouseEvent, ReactNode } from "react";
import { useAdminNavVisibility } from "../../../auth/admin-access";
import { isLoggedIn } from "../../../auth/session";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import { navigateApp } from "../../../platform/app-navigation";
import { isPlatformPath } from "../../../platform-routes";

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
  observabilitySectionLabel?: string;
  observabilityItems?: AdminNavItem[];
  accountSectionLabel?: string;
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

/** In-app platform routes use history.pushState; storefront/login use full navigation. */
function useSpaNav(href: string): { onClick?: (e: MouseEvent) => void } {
  const spa =
    href.startsWith("/") &&
    !href.startsWith("//") &&
    isPlatformPath(href) &&
    !href.startsWith("/login") &&
    !href.startsWith("/auth/");
  if (!spa) return {};
  return {
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      navigateApp(href);
    },
  };
}

function AdminNavLink({
  href,
  active,
  children,
  className,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={className ?? navLinkClass(active)} {...useSpaNav(href)}>
      {children}
    </a>
  );
}

export function AdminNav(props: AdminNavProps) {
  const { execute } = useActions();
  const loggedIn = isLoggedIn();
  const { canAccessNavItem } = useAdminNavVisibility();

  const navItems = props.navItems.filter((item) => canAccessNavItem(item.id));
  const observabilityItems = (props.observabilityItems ?? []).filter((item) =>
    canAccessNavItem(item.id),
  );
  const observabilityIds = new Set(observabilityItems.map((item) => item.id));
  const settingsItems = props.settingsItems
    .filter((item) => canAccessNavItem(item.id))
    .filter((item) => !observabilityIds.has(item.id));

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/30">
      <div className="px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.sidebarTitle}
        </p>
        <h1 className="mt-1 text-lg font-semibold">{props.productName}</h1>
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => (
          <AdminNavLink key={item.id} href={item.href} active={props.activeNav === item.id}>
            {item.label}
          </AdminNavLink>
        ))}

        {settingsItems.length > 0 ? (
          <>
            <p className="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {props.settingsSectionLabel}
            </p>
            {settingsItems.map((item) => (
              <AdminNavLink key={item.id} href={item.href} active={props.activeNav === item.id}>
                {item.label}
              </AdminNavLink>
            ))}
          </>
        ) : null}

        {observabilityItems.length > 0 && props.observabilitySectionLabel ? (
          <>
            <p className="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {props.observabilitySectionLabel}
            </p>
            {observabilityItems.map((item) => (
              <AdminNavLink key={item.id} href={item.href} active={props.activeNav === item.id}>
                {item.label}
              </AdminNavLink>
            ))}
          </>
        ) : null}

        {props.accountSectionLabel ? (
          <p className="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {props.accountSectionLabel}
          </p>
        ) : null}
        <AdminNavLink
          href={props.accountSecurityHref}
          active={props.activeNav === "account_security"}
        >
          {props.accountSecurityLabel}
        </AdminNavLink>
        <AdminNavLink
          href={props.storefrontHref}
          active={false}
          className="mt-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground"
        >
          {props.storefrontLabel}
        </AdminNavLink>
      </nav>
      <Separator />
      <div className="p-3">
        {loggedIn ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void execute({ action: "logout" })}
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
