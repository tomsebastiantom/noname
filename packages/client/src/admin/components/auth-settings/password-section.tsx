export function AuthSettingsPasswordSection({
  allowPassword,
  allowPasswordReset,
  allowSignUp,
  allowPasswordLabel,
  allowPasswordResetLabel,
  allowSignUpLabel,
  onAllowPasswordChange,
  onAllowPasswordResetChange,
  onAllowSignUpChange,
}: Readonly<{
  allowPassword: boolean;
  allowPasswordReset: boolean;
  allowSignUp: boolean;
  allowPasswordLabel: string;
  allowPasswordResetLabel: string;
  allowSignUpLabel: string;
  onAllowPasswordChange: (value: boolean) => void;
  onAllowPasswordResetChange: (value: boolean) => void;
  onAllowSignUpChange: (value: boolean) => void;
}>) {
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={allowPassword}
          onChange={(e) => onAllowPasswordChange(e.target.checked)}
          className="size-4 rounded border-input"
        />
        <span className="text-sm">{allowPasswordLabel}</span>
      </label>

      {allowPassword && (
        <>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allowPasswordReset}
              onChange={(e) => onAllowPasswordResetChange(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <span className="text-sm">{allowPasswordResetLabel}</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allowSignUp}
              onChange={(e) => onAllowSignUpChange(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <span className="text-sm">{allowSignUpLabel}</span>
          </label>
        </>
      )}
    </>
  );
}
