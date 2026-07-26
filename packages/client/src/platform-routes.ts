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
