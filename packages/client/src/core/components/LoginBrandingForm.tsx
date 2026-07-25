import { type FormEvent, useEffect, useState } from "react";
import {
  applyLoginBranding,
  extractLoginBranding,
  type LoginBrandingValues,
} from "../../admin/login-branding";
import {
  getLayoutForTemplate,
  specToJson,
} from "../../admin/layout-entries";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { executeAction } from "../../platform/registry";
import type { ComponentCtx } from "./types";

export function LoginBrandingForm({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  segment: string;
}>) {
  const segment = props.segment || "default";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [baseSpec, setBaseSpec] = useState<Record<string, unknown>>({});
  const [values, setValues] = useState<LoginBrandingValues>({
    layout: "centered",
    brandTitle: "",
    brandSubtitle: "",
    title: "Welcome back",
    subtitle: "",
    logoUrl: "",
    footerText: "",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getLayoutForTemplate("login", segment)
      .then((row) => {
        if (cancelled) return;
        if (!row) throw new Error('Login layout "login" not found — run pnpm seed:demo');
        const spec = row.data.spec ?? { root: "", elements: {} };
        setLayoutId(row.id);
        setBaseSpec(spec);
        setValues(extractLoginBranding(spec));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [segment]);

  async function save(publish: boolean) {
    if (!layoutId) return;

    publish ? setPublishing(true) : setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const spec = applyLoginBranding(baseSpec, values);
      await executeAction(
        "saveLayoutEntry",
        { id: layoutId, specJson: specToJson(spec) },
        () => {},
      );
      setBaseSpec(spec);
      if (publish) {
        await executeAction("publishLayoutEntry", { id: layoutId }, () => {});
        setSuccess("Login appearance published.");
      } else {
        setSuccess("Login appearance saved as draft.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save(false);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading login layout…</p>;
  }

  return (
    <div className="max-w-lg">
      <p className="mb-6 text-sm text-muted-foreground">
        {props.description ??
          "Edit copy and branding on /login. Changes apply to the login layout spec — no re-seed."}
      </p>

      <form className="flex flex-col gap-4" onSubmit={(e) => void onSave(e)}>
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
            placeholder="AI-native storefront platform"
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

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || publishing}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving || publishing}
            onClick={() => void save(true)}
          >
            {publishing ? "Publishing…" : "Save & publish"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href="/login" target="_blank" rel="noreferrer">
              Preview login
            </a>
          </Button>
        </div>
      </form>
    </div>
  );
}
