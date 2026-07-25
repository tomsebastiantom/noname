import type { ComponentCtx } from "./types";

const LINKS = [
  { href: "/admin/pages", label: "Pages", description: "Storefront URL tree and routing page documents" },
  { href: "/admin/content", label: "Content", description: "Edit CMS entries by content type" },
  { href: "/admin/layout", label: "Layouts", description: "Edit json-render templates (home, login, …)" },
  { href: "/admin/settings/auth", label: "Auth settings", description: "Social login and sign-in methods" },
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
