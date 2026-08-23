import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { ComponentCtx } from "../../../core/components/types";
import { getPathname, subscribeAppLocation } from "../../../platform/app-navigation";
import { adminActiveNavFromPath } from "../../../platform-routes";
import { AdminNav } from "./AdminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { resolveNavItems } from "./nav-utils";

type AdminShellProps = {
  activeNav: string;
  navItems: { id: string; href: string }[];
  settingsItems: { id: string; href: string }[];
  observabilityItems?: { id: string; href: string }[];
  accountSecurityHref: string;
  storefrontHref: string;
  title: string;
  description?: string | null;
  sidebarTitle: string;
  productName: string;
  settingsSectionLabel: string;
  observabilitySectionLabel?: string;
  nav: Record<string, string>;
  settings: Record<string, string>;
  observability?: Record<string, string>;
  accountSectionLabel?: string;
  accountSecurity: string;
  storefront: string;
  signOut: string;
  signIn: string;
};

export function AdminShell({ props, children }: ComponentCtx<AdminShellProps>) {
  const {
    activeNav: activeNavProp,
    navItems,
    settingsItems,
    observabilityItems,
    accountSecurityHref,
    storefrontHref,
    title,
    description,
    sidebarTitle,
    productName,
    settingsSectionLabel,
    observabilitySectionLabel,
    nav,
    settings,
    observability,
    accountSectionLabel,
    accountSecurity,
    storefront,
    signOut,
    signIn,
  } = props;
  const pathname = useSyncExternalStore(subscribeAppLocation, getPathname, getPathname);
  const activeNav = adminActiveNavFromPath(pathname) || activeNavProp;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AdminNav
        activeNav={activeNav}
        sidebarTitle={sidebarTitle}
        productName={productName}
        navItems={resolveNavItems(navItems, nav)}
        settingsSectionLabel={settingsSectionLabel}
        settingsItems={resolveNavItems(settingsItems, settings)}
        observabilitySectionLabel={observabilitySectionLabel}
        observabilityItems={resolveNavItems(observabilityItems ?? [], observability ?? {})}
        accountSectionLabel={accountSectionLabel}
        accountSecurityLabel={accountSecurity}
        accountSecurityHref={accountSecurityHref}
        storefrontLabel={storefront}
        storefrontHref={storefrontHref}
        signOutLabel={signOut}
        signInLabel={signIn}
      />
      <main className="flex min-h-0 flex-1 flex-col">
        <AdminPageHeader title={title} description={description} />
        <div className="min-h-0 flex-1 overflow-y-auto p-8">{children as ReactNode}</div>
      </main>
    </div>
  );
}
