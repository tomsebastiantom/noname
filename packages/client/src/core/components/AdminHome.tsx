import type { ComponentCtx } from "./types";

const LINKS = [
  {
    href: "/admin/pages",
    label: "Pages",
    description: "Storefront URL tree and routing page documents",
  },
  {
    href: "/admin/content/auth_provider",
    label: "Identity providers",
    description: "Custom OAuth/OIDC providers (schema-driven CMS entries)",
  },
  {
    href: "/admin/layout",
    label: "Layouts",
    description: "Edit json-render templates (home, login, …)",
  },
  {
    href: "/admin/settings/auth",
    label: "Auth settings",
    description: "Social login (Google, GitHub, Apple) and password toggle",
  },
  {
    href: "/account/security",
    label: "Account security",
    description: "Set up authenticator app (two-factor sign-in)",
  },
  {
    href: "/admin/settings/login",
    label: "Login appearance",
    description: "Title, logo, and brand copy on /login",
  },
] as const;

export function AdminHome({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
}>) {
  return (
    <div className="max-w-2xl">
      <p className="mb-6 text-sm text-muted-foreground">
        {props.description ?? "Manage your store without re-seeding."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
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
