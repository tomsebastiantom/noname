import { describe, expect, it } from "vitest";
import { DEFAULT_LOGIN_FORM_VIEWS } from "../core/login-form-labels";
import { applyLoginBranding, extractLoginBranding } from "./login-branding";

/** Minimal layout doc — branding editor only reads/writes login view chrome + brand. */
const loginSpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: {
        config: { layout: "centered" },
        labels: { brandTitle: "Noname", brandSubtitle: "Platform" },
      },
      children: ["form"],
    },
    form: {
      type: "LoginForm",
      props: {
        config: { logoUrl: null, redirectPath: null, showPasswordToggle: true, providers: [] },
        labels: {
          views: {
            login: DEFAULT_LOGIN_FORM_VIEWS.login,
            forgot: DEFAULT_LOGIN_FORM_VIEWS.forgot,
            reset: DEFAULT_LOGIN_FORM_VIEWS.reset,
            signup: DEFAULT_LOGIN_FORM_VIEWS.signup,
            mfa: DEFAULT_LOGIN_FORM_VIEWS.mfa,
          },
          footerText: null,
          providers: {},
          messages: {
            noSignInMethods: "No sign-in methods",
            passwordResetSent: "Reset sent",
            passwordUpdated: "Password updated",
            invalidHost: "Invalid host",
          },
        },
      },
    },
  },
};

describe("login branding helpers", () => {
  it("extracts AuthLayout and LoginForm props", () => {
    expect(extractLoginBranding(loginSpec)).toEqual({
      layout: "centered",
      brandTitle: "Noname",
      brandSubtitle: "Platform",
      title: "Welcome back",
      subtitle: "Sign in to continue",
      logoUrl: "",
      footerText: "",
    });
  });

  it("merges branding back into spec without dropping login field labels", () => {
    const updated = applyLoginBranding(loginSpec, {
      layout: "split",
      brandTitle: "Yoga Store",
      brandSubtitle: "Admin",
      title: "Hello",
      subtitle: "Sign in to continue",
      logoUrl: "https://example.com/logo.svg",
      footerText: "Need help?",
    });

    const elements = updated.elements as Record<
      string,
      { props: { config: Record<string, unknown>; labels: Record<string, unknown> } }
    >;
    const formLabels = elements.form?.props.labels as {
      views: { login: { title: string; fields: { email: string } } };
      footerText: string;
    };

    expect(elements.page?.props.config.layout).toBe("split");
    expect(elements.page?.props.labels.brandTitle).toBe("Yoga Store");
    expect(formLabels.views.login.title).toBe("Hello");
    expect(formLabels.views.login.fields.email).toBe("Email");
    expect(elements.form?.props.config.logoUrl).toBe("https://example.com/logo.svg");
    expect(formLabels.footerText).toBe("Need help?");
  });
});
