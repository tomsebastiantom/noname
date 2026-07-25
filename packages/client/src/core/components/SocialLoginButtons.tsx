import { useState } from "react";
import { Button } from "../../components/ui/button";
import { executeAction } from "../../platform/registry";

export function SocialLoginButtons({
  providers,
  redirectPath,
  providerLabels = {},
  providerIcons = {},
}: Readonly<{
  providers: string[];
  redirectPath: string;
  /** Button labels from GET /api/tenants/:slug/auth/config */
  providerLabels?: Record<string, string>;
  /** Icon URLs from GET /api/tenants/:slug/auth/config */
  providerIcons?: Record<string, string>;
}>) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) return null;

  async function onProviderClick(provider: string) {
    setError(null);
    setLoadingProvider(provider);
    try {
      await executeAction("idpLogin", { provider, redirectPath }, () => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoadingProvider(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => {
        const label =
          loadingProvider === provider
            ? "Redirecting…"
            : (providerLabels[provider] ?? `Continue with ${provider.replace(/^custom:/, "")}`);
        const iconUrl = providerIcons[provider];

        return (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full"
            disabled={loadingProvider !== null}
            onClick={() => void onProviderClick(provider)}
          >
            <span className="flex items-center justify-center gap-2">
              {iconUrl && <img src={iconUrl} alt="" className="h-4 w-4 shrink-0 object-contain" />}
              {label}
            </span>
          </Button>
        );
      })}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
