import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export function AuthAppleProviderSection({
  visible,
  configured,
  providerLabel,
  configuredBadgeLabel,
  clientId,
  teamId,
  keyId,
  privateKey,
  keyPlaceholder,
  onClientIdChange,
  onTeamIdChange,
  onKeyIdChange,
  onPrivateKeyChange,
}: Readonly<{
  visible: boolean;
  configured: boolean;
  providerLabel: string;
  configuredBadgeLabel: string;
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  keyPlaceholder: string;
  onClientIdChange: (value: string) => void;
  onTeamIdChange: (value: string) => void;
  onKeyIdChange: (value: string) => void;
  onPrivateKeyChange: (value: string) => void;
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
        <Label htmlFor="apple-client-id">Apple Services ID</Label>
        <Input
          id="apple-client-id"
          value={clientId}
          onChange={(e) => onClientIdChange(e.target.value)}
          placeholder="com.example.web"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apple-team-id">Apple Team ID</Label>
        <Input
          id="apple-team-id"
          value={teamId}
          onChange={(e) => onTeamIdChange(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apple-key-id">Apple Key ID</Label>
        <Input
          id="apple-key-id"
          value={keyId}
          onChange={(e) => onKeyIdChange(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apple-private-key">Apple Sign In private key (.p8)</Label>
        <textarea
          id="apple-private-key"
          value={privateKey}
          onChange={(e) => onPrivateKeyChange(e.target.value)}
          placeholder={keyPlaceholder}
          rows={4}
          className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
