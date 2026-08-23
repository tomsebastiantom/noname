import { useStateValue } from "@json-render/react";
import { type ReactNode, useEffect, useState } from "react";
import { startTotpEnrollment } from "../../../auth/account-flows";
import { isLoggedIn } from "../../../auth/session";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { ComponentCtx } from "../../../core/components/types";
import {
  ACCOUNT_SECURITY_STATE,
  type AccountSecuritySessionState,
} from "../../../core/login-state";
import { useCatalogSubmit } from "../../../core/use-catalog-submit";

type Step = "idle" | "setup" | "enabled";

type AccountSecurityLabels = {
  title: string;
  description: string | null;
  signInRequiredDescription: string;
  signInLinkLabel: string;
  backToStorefrontLabel: string;
  enabledBadgeLabel: string;
  enabledDescription: string;
  checkingLabel: string;
  mfaRequiredAlert: string;
  idleDescription: string;
  idleButtonLabel: string;
  idleButtonPendingLabel: string;
  setupDescription: string;
  qrAltText: string;
  verificationCodeLabel: string;
  verificationCodePlaceholder: string;
  confirmSetupLabel: string;
  confirmSetupPendingLabel: string;
  enabledStepDescription: string;
  continueToAdminLabel: string;
};

type AccountSecurityConfig = {
  variant?: "admin" | "standalone";
};

function resolveCardDescription(
  step: Step,
  sessionLoading: boolean,
  isAdmin: boolean,
  labels: AccountSecurityLabels,
): string | null {
  if (step === "enabled") return labels.enabledDescription;
  if (sessionLoading || isAdmin) return null;
  return labels.description;
}

function SecurityCardHeader({
  isAdmin,
  labels,
  cardDescription,
  showEnabledBadge,
}: Readonly<{
  isAdmin: boolean;
  labels: AccountSecurityLabels;
  cardDescription: string | null;
  showEnabledBadge: boolean;
}>) {
  if (isAdmin && !cardDescription && !showEnabledBadge) return null;

  if (!isAdmin) {
    return (
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{labels.title}</CardTitle>
            {cardDescription ? <CardDescription>{cardDescription}</CardDescription> : null}
          </div>
          {showEnabledBadge ? <Badge variant="success">{labels.enabledBadgeLabel}</Badge> : null}
        </div>
      </CardHeader>
    );
  }

  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        {cardDescription ? <CardDescription>{cardDescription}</CardDescription> : <span />}
        {showEnabledBadge ? <Badge variant="success">{labels.enabledBadgeLabel}</Badge> : null}
      </div>
    </CardHeader>
  );
}

function mfaStepContent(options: {
  step: Step;
  labels: AccountSecurityLabels;
  redirectPath: string | null | undefined;
  qrUrl: string | null;
  secret: string;
  code: string;
  loading: boolean;
  onCodeChange: (value: string) => void;
  onVerify: () => void;
  onStart: () => void;
}): ReactNode {
  const { labels } = options;
  if (options.step === "enabled") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{labels.enabledStepDescription}</p>
        {options.redirectPath?.startsWith("/") ? (
          <Button asChild variant="default">
            <a href={options.redirectPath}>{labels.continueToAdminLabel}</a>
          </Button>
        ) : null}
      </div>
    );
  }
  if (options.step === "setup") {
    return (
      <>
        <p className="text-sm text-muted-foreground">{labels.setupDescription}</p>
        {options.qrUrl ? (
          <img
            src={options.qrUrl}
            alt={labels.qrAltText}
            width={180}
            height={180}
            className="self-center rounded-md border bg-white p-2"
          />
        ) : null}
        <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">{options.secret}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            options.onVerify();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totp-code">{labels.verificationCodeLabel}</Label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={options.code}
              onChange={(e) => options.onCodeChange(e.target.value)}
              placeholder={labels.verificationCodePlaceholder}
              required
            />
          </div>
          <Button type="submit" disabled={options.loading}>
            {options.loading ? labels.confirmSetupPendingLabel : labels.confirmSetupLabel}
          </Button>
        </form>
      </>
    );
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">{labels.idleDescription}</p>
      <Button type="button" onClick={() => options.onStart()} disabled={options.loading}>
        {options.loading ? labels.idleButtonPendingLabel : labels.idleButtonLabel}
      </Button>
    </>
  );
}

function SignInRequiredCard({
  isAdmin,
  labels,
}: Readonly<{ isAdmin: boolean; labels: AccountSecurityLabels }>) {
  const signInRedirect = isAdmin
    ? "/login?redirect=%2Fadmin%2Fsettings%2Fsecurity"
    : "/login?redirect=%2Faccount%2Fsecurity";

  return (
    <Card className={isAdmin ? undefined : "mx-auto max-w-lg"}>
      <CardHeader>
        {!isAdmin ? <CardTitle>{labels.title}</CardTitle> : null}
        <CardDescription>{labels.signInRequiredDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <a href={signInRedirect} className="text-sm font-medium text-primary hover:underline">
          {labels.signInLinkLabel}
        </a>
      </CardContent>
    </Card>
  );
}

function EnrollmentAlerts({
  mfaRequired,
  step,
  labels,
  error,
  success,
}: Readonly<{
  mfaRequired: boolean;
  step: Step;
  labels: AccountSecurityLabels;
  error: string | null;
  success: string | null;
}>) {
  return (
    <>
      {mfaRequired && step !== "enabled" ? (
        <Alert>
          <AlertDescription>{labels.mfaRequiredAlert}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function AccountSecurityEnrollment({
  isAdmin,
  labels,
}: Readonly<{ isAdmin: boolean; labels: AccountSecurityLabels }>) {
  const { submit, run, error, success } = useCatalogSubmit();
  const session = useStateValue(ACCOUNT_SECURITY_STATE.session) as
    | AccountSecuritySessionState
    | null
    | undefined;
  const sessionLoading =
    (useStateValue(ACCOUNT_SECURITY_STATE.loading) as boolean | undefined) ?? true;
  const [step, setStep] = useState<Step>("idle");
  const [uri, setUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const mfaRequired = searchParams.get("mfaRequired") === "1";
  const redirectPath = searchParams.get("redirect");

  useEffect(() => {
    if (sessionLoading) return;
    if (session?.mfaEnrolled) setStep("enabled");
  }, [session, sessionLoading]);

  async function handleStart() {
    await run(
      async () => {
        const result = await startTotpEnrollment();
        setUri(result.uri);
        setSecret(result.secret);
        setStep("setup");
      },
      { onPendingChange: setLoading },
    );
  }

  async function handleVerify() {
    await submit({
      action: "confirmMfaEnrollment",
      params: { code },
      onPendingChange: setLoading,
      onSuccess: () => {
        setStep("enabled");
        setCode("");
        if (redirectPath?.startsWith("/")) {
          window.setTimeout(() => {
            window.location.href = redirectPath;
          }, 1200);
        }
      },
    });
  }

  const qrUrl = uri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}`
    : null;

  const cardDescription = resolveCardDescription(step, sessionLoading, isAdmin, labels);
  const showEnabledBadge = step === "enabled" && !sessionLoading;
  const needsTopPadding = isAdmin && !cardDescription && !showEnabledBadge;

  const card = (
    <Card>
      <SecurityCardHeader
        isAdmin={isAdmin}
        labels={labels}
        cardDescription={cardDescription}
        showEnabledBadge={showEnabledBadge}
      />
      <CardContent className={`flex flex-col gap-4${needsTopPadding ? " pt-6" : ""}`}>
        {sessionLoading ? (
          <p className="text-sm text-muted-foreground">{labels.checkingLabel}</p>
        ) : (
          <>
            <EnrollmentAlerts
              mfaRequired={mfaRequired}
              step={step}
              labels={labels}
              error={error}
              success={success}
            />
            {mfaStepContent({
              step,
              labels,
              redirectPath,
              qrUrl,
              secret,
              code,
              loading,
              onCodeChange: setCode,
              onVerify: () => void handleVerify(),
              onStart: () => void handleStart(),
            })}
          </>
        )}
      </CardContent>
    </Card>
  );

  if (isAdmin) {
    return <div className="flex max-w-xl flex-col gap-6">{card}</div>;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
        {labels.backToStorefrontLabel}
      </a>
      {card}
    </div>
  );
}

export function AccountSecurityForm({
  props,
}: Readonly<ComponentCtx<AccountSecurityConfig & AccountSecurityLabels>>) {
  const labels = props;
  const isAdmin = props.variant === "admin";

  if (!isLoggedIn()) {
    return <SignInRequiredCard isAdmin={isAdmin} labels={labels} />;
  }

  return <AccountSecurityEnrollment isAdmin={isAdmin} labels={labels} />;
}
