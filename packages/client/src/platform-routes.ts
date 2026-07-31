/** Fixed platform URLs — not merchant page_tree. See docs/2026-07-25/PAGE-ROUTING.md */

export type PlatformRoute = {
  kind: "platform";
  template: string;
  requiresAuth: boolean;
};

export type StorefrontRoute = {
  kind: "storefront";
};

export type AppRoute = PlatformRoute | StorefrontRoute;

export function isPlatformPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/auth/callback") return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/account")) return true;
  return false;
}

/** Map platform pathname → layout template. Call only when isPlatformPath is true. */
export function platformTemplateFromPath(pathname: string): string {
  if (pathname === "/login" || pathname === "/auth/callback") return "login";
  if (pathname.startsWith("/account/security")) return "account_security";
  if (pathname.startsWith("/admin/content")) return "admin_content";
  if (pathname.startsWith("/admin/layout")) return "admin_layout";
  if (pathname.startsWith("/admin/pages")) return "admin_pages";
  if (pathname === "/admin/settings/login") return "admin_login";
  if (pathname === "/admin/settings/auth") return "admin_dashboard";
  if (pathname === "/admin/settings/users") return "admin_users";
  if (pathname === "/admin/settings/flags") return "admin_flags";
  if (pathname === "/admin/settings/replay") return "admin_replay";
  if (pathname === "/admin" || pathname === "/admin/") return "admin_home";
  if (pathname.startsWith("/admin")) return "admin_home";
  return "admin_home";
}

export function isAdminTemplate(template: string): boolean {
  return template.startsWith("admin_");
}

export function isLoginTemplate(template: string): boolean {
  return template === "login";
}

export function requiresAuthPath(pathname: string): boolean {
  if (pathname.startsWith("/account")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return false;
}

export function resolveRoute(pathname: string): AppRoute {
  if (!isPlatformPath(pathname)) {
    return { kind: "storefront" };
  }
  const template = platformTemplateFromPath(pathname);
  return {
    kind: "platform",
    template,
    requiresAuth: requiresAuthPath(pathname),
  };
}

/** Sidebar highlight for AdminNav — derived from URL so SPA nav stays correct between spec swaps. */
export function adminActiveNavFromPath(pathname: string): string {
  if (pathname.startsWith("/admin/content")) return "content";
  if (pathname.startsWith("/admin/layout")) return "layout";
  if (pathname.startsWith("/admin/pages")) return "pages";
  if (pathname === "/admin/settings/auth") return "auth";
  if (pathname === "/admin/settings/users") return "users";
  if (pathname === "/admin/settings/flags") return "flags";
  if (pathname === "/admin/settings/replay") return "replay";
  if (pathname === "/admin/settings/login") return "login";
  if (pathname.startsWith("/account/security")) return "account_security";
  if (pathname === "/admin" || pathname === "/admin/") return "home";
  if (pathname.startsWith("/admin")) return "home";
  return "";
}
