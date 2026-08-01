export type AuthProvider = "google" | "github" | "apple" | (string & {});

export type LoginView = "login" | "forgot" | "reset" | "signup" | "mfa";

export function safeRedirect(path: string | null | undefined): string | null {
  if (!path?.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function viewFromSearch(search: URLSearchParams): LoginView {
  if (search.get("mfa") === "1") return "mfa";
  if (search.get("userID") && search.get("code")) return "reset";
  if (search.get("signup") === "1") return "signup";
  if (search.get("forgot") === "1") return "forgot";
  return "login";
}
