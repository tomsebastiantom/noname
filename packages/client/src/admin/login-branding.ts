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

export function extractLoginBranding(spec: Record<string, unknown>): LoginBrandingValues {
  const layout = spec as LayoutSpec;
  const auth = findByType(layout, "AuthLayout");
  const form = findByType(layout, "LoginForm");
  const authProps = auth?.props ?? {};
  const formProps = form?.props ?? {};

  return {
    layout: authProps.layout === "split" ? "split" : "centered",
    brandTitle: str(authProps.brandTitle),
    brandSubtitle: str(authProps.brandSubtitle),
    title: str(formProps.title) || DEFAULTS.title,
    subtitle: str(formProps.subtitle),
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
    auth.props.layout = values.layout;
    auth.props.brandTitle = values.brandTitle.trim() || null;
    auth.props.brandSubtitle = values.brandSubtitle.trim() || null;
  }

  if (form?.props) {
    form.props.title = values.title.trim() || DEFAULTS.title;
    form.props.subtitle = values.subtitle.trim() || null;
    form.props.logoUrl = values.logoUrl.trim() || null;
    form.props.footerText = values.footerText.trim() || null;
  }

  return next as Record<string, unknown>;
}
