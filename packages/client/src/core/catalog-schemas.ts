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
          "Configure which providers appear on your login page. Each social provider needs a ZITADEL IdP id for this org.",
        ),
    }),
    description: "Per-org auth provider toggles and ZITADEL IdP configuration",
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
      googleOAuth: z
        .object({
          clientId: z.string().min(1),
          clientSecret: z.string().min(1),
        })
        .optional(),
    }),
    description: "Save per-org auth settings and register Google IdP in ZITADEL when credentials provided",
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
};
