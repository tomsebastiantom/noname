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

export const LOGIN_VIEW_TITLES: Record<LoginView, string> = {
  login: "",
  forgot: "Forgot password",
  reset: "Set new password",
  signup: "Create account",
  mfa: "Verify your identity",
};

export const LOGIN_VIEW_SUBTITLES: Record<LoginView, string | null> = {
  login: null,
  forgot: "Enter your email and we will send reset instructions.",
  reset: "Choose a new password for your account.",
  signup: "Register with email and password.",
  mfa: "Enter the code from your authenticator app.",
};
