import type { MouseEvent } from "react";
import { isReplayAdminLink, useAnalyticsViewPermission } from "../../../auth/analytics-access";
import type { ComponentCtx } from "../../../core/components/types";
import { navigateApp } from "../../../platform/app-navigation";
import { isPlatformPath } from "../../../platform-routes";
import type { CatalogProps } from "../../../schemas/shared";

function adminHomeLinkProps(href: string): { href: string; onClick?: (e: MouseEvent) => void } {
  const spa =
    href.startsWith("/") &&
    !href.startsWith("//") &&
    isPlatformPath(href) &&
    !href.startsWith("/login");
  if (!spa) return { href };
  return {
    href,
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      navigateApp(href);
    },
  };
}

type AdminHomeConfig = {
  links: { id: string; href: string }[];
};

type AdminHomeLabels = {
  title: string;
  description: string | null;
  links: Record<string, { label: string; description: string }>;
};

export function AdminHome({ props }: ComponentCtx<CatalogProps<AdminHomeConfig, AdminHomeLabels>>) {
  const { config, labels } = props;
  const canViewReplay = useAnalyticsViewPermission();

  const links = config.links
    .map((link) => ({
      href: link.href,
      label: labels.links[link.id]?.label ?? link.id,
      description: labels.links[link.id]?.description ?? "",
    }))
    .filter((link) => !isReplayAdminLink(link.href) || canViewReplay === true);

  return (
    <div className="max-w-2xl">
      {labels.description ? (
        <p className="mb-6 text-sm text-muted-foreground">{labels.description}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <a
            key={link.href}
            {...adminHomeLinkProps(link.href)}
            className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
          >
            <p className="font-medium">{link.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
