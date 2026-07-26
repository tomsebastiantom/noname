import { z } from "zod";

/** Platform core — layout + navigation. Every extension uses these. */
export const coreComponentSchemas = {
  Grid: {
    props: z.object({
      columns: z.number().min(1).max(6).default(3),
      gap: z.number().min(0).default(16),
    }),
    slots: ["default"],
    description: "CSS Grid container for layout",
  },
  Stack: {
    props: z.object({
      direction: z.enum(["row", "column"]).default("column"),
      gap: z.number().min(0).default(16),
      align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    }),
    slots: ["default"],
    description: "Flexbox stack container",
  },
  Text: {
    props: z.object({
      value: z.string(),
      variant: z.enum(["h1", "h2", "h3", "body", "caption"]).default("body"),
      align: z.enum(["left", "center", "right"]).default("left"),
    }),
    description: "Text block with variant styles",
  },
  Button: {
    props: z.object({
      label: z.string(),
      variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
      action: z.string().nullable(),
    }),
    description: "Clickable button that dispatches an action",
  },
  Image: {
    props: z.object({
      src: z.string(),
      alt: z.string().default(""),
      fit: z.enum(["cover", "contain", "fill"]).default("cover"),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
    description: "Responsive image with object-fit",
  },
  LoginForm: {
    props: z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      redirectPath: z.string().nullable(),
      logoUrl: z.string().url().nullable().default(null),
      showPasswordToggle: z.boolean().default(true),
      footerText: z.string().nullable().default(null),
      providers: z.array(z.enum(["google", "github", "apple"])).default([]),
    }),
    description: "Email/password sign-in form (ZITADEL behind the scenes)",
  },
  AuthLayout: {
    props: z.object({
      layout: z.enum(["centered", "split"]).default("centered"),
      brandTitle: z.string().nullable().default(null),
      brandSubtitle: z.string().nullable().default(null),
    }),
    slots: ["default"],
    description: "Login page chrome — centered card or split brand panel",
  },
  AdminShell: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable().optional(),
      activeNav: z.string().default("auth"),
    }),
    slots: ["default"],
    description: "Admin dashboard shell with sidebar navigation",
  },
  AuthSettingsForm: {
    props: z.object({
      title: z.string().default("Sign-in methods"),
      description: z
        .string()
        .nullable()
        .default(
          "Enable Google, GitHub, or Apple sign-in. Save registers IdPs in ZITADEL and updates platform settings for this org.",
        ),
    }),
    description: "Per-org auth provider toggles and ZITADEL IdP configuration",
  },
  LoginBrandingForm: {
    props: z.object({
      title: z.string().default("Login appearance"),
      description: z
        .string()
        .nullable()
        .default("Edit title, logo, and brand copy on /login without editing raw JSON."),
      segment: z.string().default("default"),
    }),
    description: "Structured editor for login layout branding props",
  },
  AccountSecurityForm: {
    props: z.object({
      title: z.string().default("Account security"),
      description: z
        .string()
        .nullable()
        .default("Set up an authenticator app for two-factor sign-in."),
    }),
    description: "TOTP enrollment for the signed-in user",
  },
  ContentEntryAdmin: {
    props: z.object({
      title: z.string().default("Content"),
      description: z
        .string()
        .nullable()
        .default("Edit CMS entries by content type — schema-driven, not extension-specific."),
      locale: z.string().default("en-US"),
    }),
    description: "Generic CMS entry list and form driven by content type schema",
  },
  LayoutEntryAdmin: {
    props: z.object({
      title: z.string().default("Layouts"),
      description: z
        .string()
        .nullable()
        .default("Edit json-render layout templates — home, login, and other page specs."),
      segment: z.string().default("default"),
    }),
    description: "Layout template list and JSON spec editor with publish",
  },
  AdminHome: {
    props: z.object({
      title: z.string().default("Dashboard"),
      description: z
        .string()
        .nullable()
        .default("Manage content, layouts, and auth without re-seeding."),
    }),
    description: "Admin overview with links to platform settings",
  },
  PageRoutingAdmin: {
    props: z.object({
      title: z.string().default("Pages"),
      description: z
        .string()
        .nullable()
        .default("Storefront routing — page documents and URL tree."),
      locale: z.string().default("en-US"),
    }),
    description: "Routing page list/editor and page_tree URL map",
  },
  PageTreeAdmin: {
    props: z.object({
      title: z.string().default("URL tree"),
      description: z.string().nullable().default("Map storefront paths to page document keys."),
      locale: z.string().default("en-US"),
    }),
    description: "Edit page_tree slug → pageId mappings",
  },
  PageEntryAdmin: {
    props: z.object({
      title: z.string().default("Page documents"),
      description: z
        .string()
        .nullable()
        .default("Layout template + contentRef for each routing page."),
    }),
    description: "Edit routing page documents (layoutRef, contentRef)",
  },
};

export const coreActionSchemas = {
  navigate: {
    params: z.object({
      path: z.string(),
    }),
    description: "Navigate to a page",
  },
  login: {
    params: z.object({
      email: z.string().email(),
      password: z.string().min(1),
      redirectPath: z.string().optional(),
    }),
    description: "Sign in with email and password",
  },
  logout: {
    description: "Sign out and redirect to login",
  },
  idpLogin: {
    params: z.object({
      provider: z.enum(["google", "github", "apple"]),
      redirectPath: z.string().optional(),
    }),
    description: "Start OAuth sign-in with an external identity provider",
  },
  saveAuthConfig: {
    params: z.object({
      providers: z.array(z.enum(["google", "github", "apple"])),
      allowPassword: z.boolean(),
      allowSignUp: z.boolean().optional(),
      allowPasswordReset: z.boolean().optional(),
      googleOAuth: z
        .object({
          clientId: z.string().min(1),
          clientSecret: z.string().min(1),
        })
        .optional(),
      githubOAuth: z
        .object({
          clientId: z.string().min(1),
          clientSecret: z.string().min(1),
        })
        .optional(),
      appleOAuth: z
        .object({
          clientId: z.string().min(1),
          teamId: z.string().min(1),
          keyId: z.string().min(1),
          privateKey: z.string().min(1),
        })
        .optional(),
    }),
    description:
      "Save per-org auth settings and register IdPs in ZITADEL when credentials provided",
  },
  requestPasswordReset: {
    params: z.object({
      email: z.string().email(),
    }),
    description: "Send password reset email via ZITADEL",
  },
  confirmPasswordReset: {
    params: z.object({
      userId: z.string().min(1),
      verificationCode: z.string().min(1),
      newPassword: z.string().min(8),
    }),
    description: "Confirm password reset with verification code",
  },
  register: {
    params: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      givenName: z.string().optional(),
      familyName: z.string().optional(),
      redirectPath: z.string().optional(),
    }),
    description: "Create a new account in ZITADEL for this org",
  },
  verifyMfa: {
    params: z.object({
      totpCode: z.string().min(1),
      redirectPath: z.string().optional(),
    }),
    description: "Complete sign-in with TOTP after password step",
  },
  confirmMfaEnrollment: {
    params: z.object({
      code: z.string().min(1),
    }),
    description: "Confirm TOTP enrollment with a verification code",
  },
  saveContentEntry: {
    params: z.object({
      contentType: z.string().min(1),
      id: z.string().min(1),
      schema: z.object({
        fields: z.array(
          z.object({
            key: z.string(),
            type: z.string(),
            required: z.boolean(),
            isLocalizable: z.boolean(),
            label: z.string(),
          }),
        ),
      }),
      values: z.record(z.string(), z.string()),
      locale: z.string().optional(),
    }),
    description: "Save a CMS content entry draft",
  },
  publishContentEntry: {
    params: z.object({
      contentType: z.string().min(1),
      id: z.string().min(1),
    }),
    description: "Publish a CMS content entry",
  },
  createContentEntry: {
    params: z.object({
      contentType: z.string().min(1),
      schema: z.object({
        fields: z.array(
          z.object({
            key: z.string(),
            type: z.string(),
            required: z.boolean(),
            isLocalizable: z.boolean(),
            label: z.string(),
          }),
        ),
      }),
      values: z.record(z.string(), z.string()),
      locale: z.string().optional(),
    }),
    description: "Create a new CMS content entry",
  },
  saveLayoutEntry: {
    params: z.object({
      id: z.string().min(1),
      specJson: z.string().min(2),
      contentRef: z.string().nullable().optional(),
    }),
    description: "Save a layout template draft (json-render spec JSON)",
  },
  publishLayoutEntry: {
    params: z.object({
      id: z.string().min(1),
    }),
    description: "Publish a layout template",
  },
};
