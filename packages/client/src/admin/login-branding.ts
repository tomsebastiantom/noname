/** Read/write LoginForm + AuthLayout props inside a login layout spec. */

export interface LoginBrandingValues {
  layout: "centered" | "split";
  brandTitle: string;
  brandSubtitle: string;
  title: string;
  subtitle: string;
  logoUrl: string;
  footerText: string;
}

const DEFAULTS: LoginBrandingValues = {
  layout: "centered",
  brandTitle: "",
  brandSubtitle: "",
  title: "Welcome back",
  subtitle: "",
  logoUrl: "",
  footerText: "",
};

type SpecElement = {
  type?: string;
  props?: Record<string, unknown>;
  children?: string[];
};

type LayoutSpec = {
  root?: string;
  elements?: Record<string, SpecElement>;
};

function findByType(spec: LayoutSpec, type: string): SpecElement | null {
  const elements = spec.elements ?? {};
  for (const el of Object.values(elements)) {
    if (el?.type === type) return el;
  }
  return null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function loginViews(
  props: SpecElement["props"],
): Record<string, { title?: string; description?: string | null }> {
  const views = props?.views;
  if (views && typeof views === "object" && !Array.isArray(views)) {
    return views as Record<string, { title?: string; description?: string | null }>;
  }
  return {};
}

export function extractLoginBranding(spec: Record<string, unknown>): LoginBrandingValues {
  const layout = spec as LayoutSpec;
  const auth = findByType(layout, "AuthLayout");
  const form = findByType(layout, "LoginForm");
  const authProps = auth?.props ?? {};
  const formProps = form?.props ?? {};
  const loginView = loginViews(formProps).login ?? {};

  return {
    layout: authProps.layout === "split" ? "split" : "centered",
    brandTitle: str(authProps.brandTitle),
    brandSubtitle: str(authProps.brandSubtitle),
    title: str(loginView.title) || DEFAULTS.title,
    subtitle: str(loginView.description),
    logoUrl: str(formProps.logoUrl),
    footerText: str(formProps.footerText),
  };
}

export function applyLoginBranding(
  spec: Record<string, unknown>,
  values: LoginBrandingValues,
): Record<string, unknown> {
  const next = structuredClone(spec) as LayoutSpec;
  const auth = findByType(next, "AuthLayout");
  const form = findByType(next, "LoginForm");

  if (auth?.props) {
    auth.props = {
      ...auth.props,
      layout: values.layout,
      brandTitle: values.brandTitle.trim() || null,
      brandSubtitle: values.brandSubtitle.trim() || null,
    };
  }

  if (form?.props) {
    const views = loginViews(form.props);
    form.props = {
      ...form.props,
      logoUrl: values.logoUrl.trim() || null,
      footerText: values.footerText.trim() || null,
      views: {
        ...views,
        login: {
          ...(views.login ?? {}),
          title: values.title.trim() || DEFAULTS.title,
          description: values.subtitle.trim() || null,
        },
      },
    };
  }

  return next as Record<string, unknown>;
}
