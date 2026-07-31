import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export function AuthCredentialProviderSection({
  visible,
  configured,
  clientId,
  clientSecret,
  onClientIdChange,
  onClientSecretChange,
  idPrefix,
  secretPlaceholder,
  providerLabel,
  configuredBadgeLabel,
}: Readonly<{
  visible: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  onClientIdChange: (value: string) => void;
  onClientSecretChange: (value: string) => void;
  idPrefix: string;
  secretPlaceholder: string;
  providerLabel: string;
  configuredBadgeLabel: string;
}>) {
  if (!visible) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{providerLabel}</span>
        {configured && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {configuredBadgeLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-client-id`}>{providerLabel} OAuth Client ID</Label>
        <Input
          id={`${idPrefix}-client-id`}
          value={clientId}
          onChange={(e) => onClientIdChange(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-client-secret`}>{providerLabel} OAuth Client Secret</Label>
        <Input
          id={`${idPrefix}-client-secret`}
          type="password"
          value={clientSecret}
          onChange={(e) => onClientSecretChange(e.target.value)}
          placeholder={secretPlaceholder}
          autoComplete="new-password"
        />
      </div>
    </div>
  );
}
