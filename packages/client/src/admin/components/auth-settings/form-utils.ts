import type { AuthProvider } from "../../../auth/auth-settings";

export function cmsProviderEnabled(
  authProviders: Array<{ providerKey: AuthProvider; enabled: boolean }>,
  provider: AuthProvider,
): boolean {
  return authProviders.find((entry) => entry.providerKey === provider)?.enabled ?? false;
}

export function cmsProviderName(
  authProviders: Array<{ providerKey: AuthProvider; name: string }>,
  provider: AuthProvider,
  fallback: string,
): string {
  return authProviders.find((entry) => entry.providerKey === provider)?.name ?? fallback;
}
