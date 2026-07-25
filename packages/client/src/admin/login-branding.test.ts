import { describe, expect, it } from "vitest";
import { applyLoginBranding, extractLoginBranding } from "./login-branding";

const loginSpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: {
        layout: "centered",
        brandTitle: "Noname",
        brandSubtitle: "Platform",
      },
      children: ["form"],
    },
    form: {
      type: "LoginForm",
      props: {
        title: "Welcome back",
        subtitle: "Sign in",
        logoUrl: null,
        footerText: null,
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
      subtitle: "Sign in",
      logoUrl: "",
      footerText: "",
    });
  });

  it("merges branding back into spec", () => {
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
    expect(elements.page?.props.layout).toBe("split");
    expect(elements.page?.props.brandTitle).toBe("Yoga Store");
    expect(elements.form?.props.title).toBe("Hello");
    expect(elements.form?.props.logoUrl).toBe("https://example.com/logo.svg");
  });
});
