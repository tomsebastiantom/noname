import type { MouseEvent } from "react";
import { isReplayAdminLink, useAnalyticsViewPermission } from "../../auth/analytics-access";
import { navigateApp } from "../../platform/app-navigation";
import { isPlatformPath } from "../../platform-routes";
import type { ComponentCtx } from "./types";

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

export function AdminHome({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  links: { href: string; label: string; description: string }[];
}>) {
  const canViewReplay = useAnalyticsViewPermission();

  const links = props.links.filter(
    (link) => !isReplayAdminLink(link.href) || canViewReplay === true,
  );

  return (
    <div className="max-w-2xl">
      {props.description ? (
        <p className="mb-6 text-sm text-muted-foreground">{props.description}</p>
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
