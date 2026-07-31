export function AuthSettingsMfaSection({
  requireMfaForAdmin,
  adminSecurityLegend,
  requireMfaLabel,
  mfaHelperText,
  onRequireMfaChange,
}: Readonly<{
  requireMfaForAdmin: boolean;
  adminSecurityLegend: string;
  requireMfaLabel: string;
  mfaHelperText: string;
  onRequireMfaChange: (value: boolean) => void;
}>) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{adminSecurityLegend}</legend>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={requireMfaForAdmin}
          onChange={(e) => onRequireMfaChange(e.target.checked)}
          className="size-4 rounded border-input"
        />
        <span className="text-sm">{requireMfaLabel}</span>
      </label>
      <p className="text-xs text-muted-foreground">{mfaHelperText}</p>
    </fieldset>
  );
}
