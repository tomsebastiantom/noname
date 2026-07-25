import type { TenantAuthConfig } from "../documents/ports";

export function resolveGoogleIdpId(
  current: TenantAuthConfig,
  patch: {
    providers?: string[];
    idpIds?: Record<string, string>;
    googleOAuth?: { clientId: string; clientSecret: string };
  },
): {
  required: boolean;
  existingIdpId?: string;
  googleOAuth?: { clientId: string; clientSecret: string };
} {
  const providers = patch.providers ?? current.providers;
  if (!providers.includes("google")) {
    return { required: false };
  }

  const mergedIdpIds = patch.idpIds ? { ...current.idpIds, ...patch.idpIds } : current.idpIds;
  const existingIdpId = mergedIdpIds.google?.trim() || undefined;

  if (patch.googleOAuth) {
    return { required: true, existingIdpId, googleOAuth: patch.googleOAuth };
  }

  if (existingIdpId) {
    return { required: false, existingIdpId };
  }

  return { required: true };
}
