import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { ComponentCtx } from "../../../core/components/types";
import { getPathname, subscribeAppLocation } from "../../../platform/app-navigation";
import { adminActiveNavFromPath } from "../../../platform-routes";
import type { CatalogProps } from "../../../schemas/shared";
import { AdminNav } from "./AdminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { resolveNavItems } from "./nav-utils";

type AdminShellConfig = {
  activeNav: string;
  navItems: { id: string; href: string }[];
  settingsItems: { id: string; href: string }[];
  accountSecurityHref: string;
  storefrontHref: string;
};

type AdminShellLabels = {
  title: string;
  description?: string | null;
  sidebarTitle: string;
  productName: string;
  settingsSectionLabel: string;
  nav: Record<string, string>;
  settings: Record<string, string>;
  accountSecurity: string;
  storefront: string;
  signOut: string;
  signIn: string;
};

export function AdminShell({
  props,
  children,
}: ComponentCtx<CatalogProps<AdminShellConfig, AdminShellLabels>>) {
  const { config, labels } = props;
  const pathname = useSyncExternalStore(subscribeAppLocation, getPathname, getPathname);
  const activeNav = adminActiveNavFromPath(pathname) || config.activeNav;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminNav
        activeNav={activeNav}
        sidebarTitle={labels.sidebarTitle}
        productName={labels.productName}
        navItems={resolveNavItems(config.navItems, labels.nav)}
        settingsSectionLabel={labels.settingsSectionLabel}
        settingsItems={resolveNavItems(config.settingsItems, labels.settings)}
        accountSecurityLabel={labels.accountSecurity}
        accountSecurityHref={config.accountSecurityHref}
        storefrontLabel={labels.storefront}
        storefrontHref={config.storefrontHref}
        signOutLabel={labels.signOut}
        signInLabel={labels.signIn}
      />
      <main className="flex flex-1 flex-col">
        <AdminPageHeader title={labels.title} description={labels.description} />
        <div className="flex-1 p-8">{children as ReactNode}</div>
      </main>
    </div>
  );
}
