import { useStateValue } from "@json-render/react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { LoginBrandingLoaded } from "../../../core/actions/layout";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";
import { specToJson } from "../../layout-entries";
import { applyLoginBranding, type LoginBrandingValues } from "../../login-branding";

type LoginBrandingConfig = {
  segment: string;
};

type LoginBrandingLabels = {
  title: string;
  description: string | null;
  saveLabel: string;
  savingLabel: string;
  publishLabel: string;
  publishingLabel: string;
  previewLoginLabel: string;
  draftSavedMessage: string;
  publishedMessage: string;
  loadingLabel: string;
};

type LoginBrandingFormProps = ComponentCtx<CatalogProps<LoginBrandingConfig, LoginBrandingLabels>>;

function LoginBrandingFields({
  loaded,
  labels,
  loadError,
}: {
  loaded: LoginBrandingLoaded;
  labels: LoginBrandingLabels;
  loadError: string | null | undefined;
}) {
  const { run, executeAction, error, success } = useCatalogSubmit();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [layoutId] = useState(loaded.layoutId);
  const [baseSpec, setBaseSpec] = useState(loaded.baseSpec);
  const [values, setValues] = useState<LoginBrandingValues>(loaded.values);

  async function save(publish: boolean) {
    await run(
      async () => {
        const spec = applyLoginBranding(baseSpec, values);
        await executeAction("saveLayoutEntry", { id: layoutId, specJson: specToJson(spec) });
        setBaseSpec(spec);
        if (publish) {
          await executeAction("publishLayoutEntry", { id: layoutId });
        }
      },
      {
        successMessage: publish ? labels.publishedMessage : labels.draftSavedMessage,
        onPendingChange: publish ? setPublishing : setSaving,
      },
    );
  }

  const displayError = mergeCatalogError(error, loadError);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-layout">Layout style</Label>
        <select
          id="login-layout"
          value={values.layout}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              layout: e.target.value === "split" ? "split" : "centered",
            }))
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="centered">Centered card</option>
          <option value="split">Split (brand panel + form)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-title">Brand title</Label>
        <Input
          id="brand-title"
          value={values.brandTitle}
          onChange={(e) => setValues((v) => ({ ...v, brandTitle: e.target.value }))}
          placeholder="Noname"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-subtitle">Brand subtitle</Label>
        <Input
          id="brand-subtitle"
          value={values.brandSubtitle}
          onChange={(e) => setValues((v) => ({ ...v, brandSubtitle: e.target.value }))}
          placeholder="Platform demo"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-title">Form title</Label>
        <Input
          id="login-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-subtitle">Form subtitle</Label>
        <Input
          id="login-subtitle"
          value={values.subtitle}
          onChange={(e) => setValues((v) => ({ ...v, subtitle: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo-url">Logo URL</Label>
        <Input
          id="logo-url"
          type="url"
          value={values.logoUrl}
          onChange={(e) => setValues((v) => ({ ...v, logoUrl: e.target.value }))}
          placeholder="https://…"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="footer-text">Footer text</Label>
        <Input
          id="footer-text"
          value={values.footerText}
          onChange={(e) => setValues((v) => ({ ...v, footerText: e.target.value }))}
        />
      </div>

      {displayError && (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || publishing}>
          {saving ? labels.savingLabel : labels.saveLabel}
        </Button>
        {loaded.canPublish && (
          <Button
            type="button"
            variant="outline"
            disabled={saving || publishing}
            onClick={() => void save(true)}
          >
            {publishing ? labels.publishingLabel : labels.publishLabel}
          </Button>
        )}
        <Button type="button" variant="ghost" asChild>
          <a href="/login" target="_blank" rel="noreferrer">
            {labels.previewLoginLabel}
          </a>
        </Button>
      </div>
    </form>
  );
}

export function LoginBrandingForm({ props }: LoginBrandingFormProps) {
  const { config, labels } = props;
  const segment = config.segment || "default";
  const loadParams = useMemo(() => ({ segment }), [segment]);
  useMountAction("loadLoginBranding", loadParams);

  const loaded = useStateValue(ADMIN_STATE.loginBranding.loaded) as
    | LoginBrandingLoaded
    | null
    | undefined;
  const loading = (useStateValue(ADMIN_STATE.loginBranding.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.loginBranding.error) as string | null | undefined;

  if (loading) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (!loaded) {
    return null;
  }

  return (
    <div className="max-w-lg">
      {labels.description ? (
        <p className="mb-6 text-sm text-muted-foreground">{labels.description}</p>
      ) : null}

      <LoginBrandingFields
        key={loaded.loadedAt}
        loaded={loaded}
        labels={labels}
        loadError={loadError}
      />
    </div>
  );
}
