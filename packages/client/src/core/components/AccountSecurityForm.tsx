import { type FormEvent, useState } from "react";
import { startTotpEnrollment } from "../../auth/account-flows";
import { isLoggedIn } from "../../auth/session";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { executeAction } from "../../platform/registry";
import type { ComponentCtx } from "./types";

type Step = "idle" | "setup" | "enabled";

export function AccountSecurityForm({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
}>) {
  const [step, setStep] = useState<Step>("idle");
  const [uri, setUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isLoggedIn()) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>Sign in to manage your account security settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/login?redirect=%2Faccount%2Fsecurity"
            className="text-sm font-medium text-primary hover:underline"
          >
            Sign in →
          </a>
        </CardContent>
      </Card>
    );
  }

  async function handleStart() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await startTotpEnrollment();
      setUri(result.uri);
      setSecret(result.secret);
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await executeAction("confirmMfaEnrollment", { code }, () => {});
      setStep("enabled");
      setSuccess("Authenticator app enabled. You will be asked for a code at sign-in.");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const qrUrl = uri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}`
    : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to storefront
      </a>

      <Card>
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.description && <CardDescription>{props.description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === "enabled" ? (
            <p className="text-sm text-muted-foreground">
              Two-factor authentication is enabled for your account.
            </p>
          ) : step === "setup" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Scan the QR code with Google Authenticator, Authy, or a similar app. Or enter the
                secret manually.
              </p>
              {qrUrl ? (
                <img
                  src={qrUrl}
                  alt="TOTP QR code"
                  width={180}
                  height={180}
                  className="self-center rounded-md border bg-white p-2"
                />
              ) : null}
              <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">{secret}</div>
              <form onSubmit={(e) => void handleVerify(e)} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="totp-code">Verification code</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? "Verifying…" : "Confirm setup"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Add an authenticator app for an extra sign-in step after your password.
              </p>
              <Button type="button" onClick={() => void handleStart()} disabled={loading}>
                {loading ? "Starting…" : "Set up authenticator app"}
              </Button>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
