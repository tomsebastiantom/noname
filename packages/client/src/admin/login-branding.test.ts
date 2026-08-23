import { describe, expect, it } from "vitest";
import { DEFAULT_LOGIN_FORM_VIEWS } from "../core/login-form-labels";
import { applyLoginBranding, extractLoginBranding } from "./login-branding";

/** Minimal layout doc — branding editor only reads/writes login view chrome + brand. */
const loginSpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: { layout: "centered", brandTitle: "Noname", brandSubtitle: "Platform" },
      children: ["form"],
    },
    form: {
      type: "LoginForm",
      props: {
        logoUrl: null,
        redirectPath: null,
        showPasswordToggle: true,
        providers: [],
        views: {
          login: DEFAULT_LOGIN_FORM_VIEWS.login,
          forgot: DEFAULT_LOGIN_FORM_VIEWS.forgot,
          reset: DEFAULT_LOGIN_FORM_VIEWS.reset,
          signup: DEFAULT_LOGIN_FORM_VIEWS.signup,
          mfa: DEFAULT_LOGIN_FORM_VIEWS.mfa,
        },
        footerText: null,
        messages: {
          noSignInMethods: "No sign-in methods",
          passwordResetSent: "Reset sent",
          passwordUpdated: "Password updated",
          invalidHost: "Invalid host",
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

    const elements = updated.elements as Record<string, { props: Record<string, unknown> }>;
    const formProps = elements.form?.props as {
      views: { login: { title: string; fields: { email: string } } };
      footerText: string;
    };

    expect(elements.page?.props.layout).toBe("split");
    expect(elements.page?.props.brandTitle).toBe("Yoga Store");
    expect(formProps.views.login.title).toBe("Hello");
    expect(formProps.views.login.fields.email).toBe("Email");
    expect(elements.form?.props.logoUrl).toBe("https://example.com/logo.svg");
    expect(formProps.footerText).toBe("Need help?");
  });
});
