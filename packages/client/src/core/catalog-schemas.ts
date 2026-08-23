import { z } from "zod";
import { loginFormMessagesSchema, loginViewFieldsSchema } from "./login-form-labels";

/** Platform core — layout, auth shell, and mount hooks. Every extension uses these. */
export const coreComponentSchemas = {
  GridBase: {
    props: z.object({
      columns: z.number().min(1).max(6).default(3),
      gap: z.number().min(0).default(16),
    }),
    slots: ["default"],
    description: "CSS Grid container for layout",
  },
  StackBase: {
    props: z.object({
      direction: z.enum(["row", "column"]).default("column"),
      gap: z.number().min(0).default(16),
      align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    }),
    slots: ["default"],
    description: "Flexbox stack container",
  },
  TextBase: {
    props: z.object({
      content: z.string(),
      variant: z.enum(["h1", "h2", "h3", "body", "caption"]).default("body"),
      align: z.enum(["left", "center", "right"]).default("left"),
    }),
    description: "Text block with variant styles",
  },
  ButtonBase: {
    props: z.object({
      label: z.string(),
      variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
      action: z.string().nullable(),
    }),
    description: "Clickable button that dispatches an action",
  },
  ImageBase: {
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
      views: loginViewFieldsSchema,
      footerText: z.string().nullable().default(null),
      providers: z.record(z.string(), z.string()).default({}),
      messages: loginFormMessagesSchema,
      redirectPath: z.string().nullable(),
      logoUrl: z.string().url().nullable().default(null),
      showPasswordToggle: z.boolean().default(true),
      providerList: z.array(z.enum(["google", "github", "apple"])).default([]),
    }),
    description: "Email/password sign-in form (ZITADEL behind the scenes)",
  },
  AuthLayout: {
    props: z.object({
      brandTitle: z.string().nullable().default(null),
      brandSubtitle: z.string().nullable().default(null),
      layout: z.enum(["centered", "split"]).default("centered"),
    }),
    slots: ["default"],
    description: "Login page chrome — centered card or split brand panel",
  },
  MountAction: {
    props: z.object({
      action: z.string().min(1),
      params: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
    description: "Run a catalog action on mount (layout-declared data load)",
  },
  AccountNotificationsInbox: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      loadingLabel: z.string(),
      forbiddenLabel: z.string(),
      emptyLabel: z.string(),
      refreshLabel: z.string(),
      unreadOnlyLabel: z.string(),
      allLabel: z.string(),
      markReadLabel: z.string(),
      columns: z.object({
        when: z.string(),
        title: z.string(),
        trigger: z.string(),
        status: z.string(),
        actions: z.string(),
      }),
    }),
    description: "Signed-in customer notification inbox at /account/notifications",
  },
  AccountNotificationPrefsForm: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      signInRequiredDescription: z.string(),
      signInLinkLabel: z.string(),
      loadingLabel: z.string(),
      saveLabel: z.string(),
      savingLabel: z.string(),
      successMessage: z.string(),
      inboxLinkLabel: z.string(),
      channelsSectionTitle: z.string(),
      categoriesSectionTitle: z.string(),
      transactionalNote: z.string(),
      channels: z.object({
        email: z.object({ label: z.string(), helper: z.string() }),
        sms: z.object({ label: z.string(), helper: z.string() }),
        in_app: z.object({ label: z.string(), helper: z.string() }),
      }),
      categories: z.object({
        marketing: z.object({ label: z.string(), helper: z.string() }),
        operational: z.object({ label: z.string(), helper: z.string() }),
      }),
    }),
    description: "Per-user communication channel preferences at /account/communication-preferences",
  },
};

export const coreActionSchemas = {
  loadLoginConfig: {
    params: z.object({
      storeSlug: z.string().min(1),
    }),
    description: "Load org auth provider config for login form",
  },
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
  loadAccountSecuritySession: {
    description: "Load MFA enrollment status for the signed-in user",
  },
  loadNotificationPreferences: {
    description: "Load signed-in user communication preferences",
  },
  loadAccountInbox: {
    params: z
      .object({
        unreadOnly: z.boolean().optional(),
      })
      .optional(),
    description: "Load signed-in customer in-app notification inbox",
  },
  markAccountInboxRead: {
    params: z.object({
      itemId: z.string(),
    }),
    description: "Mark a customer inbox item as read",
  },
  saveNotificationPreferences: {
    params: z.object({
      channels: z.object({
        email: z.boolean(),
        sms: z.boolean(),
        in_app: z.boolean(),
      }),
      categories: z.object({
        marketing: z.boolean(),
        operational: z.boolean(),
      }),
    }),
    description: "Update signed-in user communication preferences",
  },
};
