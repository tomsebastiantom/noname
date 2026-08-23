import { useStateValue } from "@json-render/react";
import { useEffect, useState } from "react";
import type { NotificationPreferences } from "../../auth/notifications-settings";
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
import { Label } from "../../components/ui/label";
import {
  ACCOUNT_NOTIFICATION_PREFS_STATE,
  type AccountNotificationPrefsState,
} from "../login-state";
import { mergeCatalogError, useCatalogSubmit } from "../use-catalog-submit";
import { useMountAction } from "./MountAction";
import type { ComponentCtx } from "./types";

type PrefFieldLabels = {
  label: string;
  helper: string;
};

type AccountNotificationPrefsLabels = {
  title: string;
  description: string | null;
  signInRequiredDescription: string;
  signInLinkLabel: string;
  loadingLabel: string;
  saveLabel: string;
  savingLabel: string;
  successMessage: string;
  inboxLinkLabel: string;
  channelsSectionTitle: string;
  categoriesSectionTitle: string;
  transactionalNote: string;
  channels: {
    email: PrefFieldLabels;
    sms: PrefFieldLabels;
    in_app: PrefFieldLabels;
  };
  categories: {
    marketing: PrefFieldLabels;
    operational: PrefFieldLabels;
  };
};

function PrefToggle({
  id,
  checked,
  onChange,
  field,
}: Readonly<{
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  field: PrefFieldLabels;
}>) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="space-y-1">
        <Label htmlFor={id}>{field.label}</Label>
        <p className="text-sm text-muted-foreground">{field.helper}</p>
      </div>
    </div>
  );
}

function applyLoadedPrefs(loaded: NotificationPreferences) {
  return {
    channels: { ...loaded.channels },
    categories: { ...loaded.categories },
  };
}

export function AccountNotificationPrefsForm({
  props,
}: ComponentCtx<AccountNotificationPrefsLabels>) {
  const labels = props;
  const loggedIn = isLoggedIn();
  const { submit, pending, error, success, clearSuccess } = useCatalogSubmit();

  const channelFields = labels.channels ?? {
    email: { label: "", helper: "" },
    sms: { label: "", helper: "" },
    in_app: { label: "", helper: "" },
  };
  const categoryFields = labels.categories ?? {
    marketing: { label: "", helper: "" },
    operational: { label: "", helper: "" },
  };

  useMountAction("loadNotificationPreferences");

  const loaded = useStateValue(ACCOUNT_NOTIFICATION_PREFS_STATE.loaded) as
    | AccountNotificationPrefsState
    | null
    | undefined;
  const loading =
    (useStateValue(ACCOUNT_NOTIFICATION_PREFS_STATE.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ACCOUNT_NOTIFICATION_PREFS_STATE.error) as
    | string
    | null
    | undefined;

  const [channels, setChannels] = useState<NotificationPreferences["channels"]>({
    email: true,
    sms: false,
    in_app: true,
  });
  const [categories, setCategories] = useState<NotificationPreferences["categories"]>({
    marketing: false,
    operational: true,
  });

  useEffect(() => {
    if (!loaded) return;
    const next = applyLoadedPrefs(loaded);
    setChannels(next.channels);
    setCategories(next.categories);
  }, [loaded]);

  if (!loggedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{labels.signInRequiredDescription}</p>
          <a href="/login" className="text-sm font-medium underline-offset-4 hover:underline">
            {labels.signInLinkLabel}
          </a>
        </CardContent>
      </Card>
    );
  }

  const displayError = mergeCatalogError(error, loadError);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {displayError ? (
          <Alert variant="destructive">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        ) : null}
        {success ? (
          <Alert>
            <AlertDescription>{labels.successMessage}</AlertDescription>
          </Alert>
        ) : null}

        {loading && !loaded ? (
          <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
        ) : null}

        {loaded ? (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              clearSuccess();
              void submit({
                action: "saveNotificationPreferences",
                params: { channels, categories },
              });
            }}
          >
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{labels.channelsSectionTitle}</h3>
              <PrefToggle
                id="pref-channel-email"
                checked={channels.email}
                onChange={(email) => setChannels((prev) => ({ ...prev, email }))}
                field={channelFields.email}
              />
              <PrefToggle
                id="pref-channel-sms"
                checked={channels.sms}
                onChange={(sms) => setChannels((prev) => ({ ...prev, sms }))}
                field={channelFields.sms}
              />
              <PrefToggle
                id="pref-channel-in-app"
                checked={channels.in_app}
                onChange={(in_app) => setChannels((prev) => ({ ...prev, in_app }))}
                field={channelFields.in_app}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">{labels.categoriesSectionTitle}</h3>
              <p className="text-sm text-muted-foreground">{labels.transactionalNote}</p>
              <PrefToggle
                id="pref-category-marketing"
                checked={categories.marketing}
                onChange={(marketing) => setCategories((prev) => ({ ...prev, marketing }))}
                field={categoryFields.marketing}
              />
              <PrefToggle
                id="pref-category-operational"
                checked={categories.operational}
                onChange={(operational) => setCategories((prev) => ({ ...prev, operational }))}
                field={categoryFields.operational}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? labels.savingLabel : labels.saveLabel}
              </Button>
              <a
                href="/account/notifications"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {labels.inboxLinkLabel}
              </a>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
