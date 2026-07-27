import { z } from "zod";

const adminNavItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string(),
});

const adminLinkSchema = z.object({
  href: z.string(),
  label: z.string(),
  description: z.string(),
});

const draftPublishLabelsSchema = z.object({
  saveLabel: z.string(),
  savingLabel: z.string(),
  publishLabel: z.string(),
  publishingLabel: z.string(),
});

const mediaFieldLabelsSchema = z.object({
  uploadFileLabel: z.string(),
  uploadingLabel: z.string(),
  pickExistingLabel: z.string(),
  loadingAssetsLabel: z.string(),
  clearLabel: z.string(),
});

const adminShellNavSchema = z.object({
  sidebarTitle: z.string(),
  productName: z.string(),
  navItems: z.array(adminNavItemSchema),
  settingsSectionLabel: z.string(),
  settingsItems: z.array(adminNavItemSchema),
  accountSecurityLabel: z.string(),
  accountSecurityHref: z.string(),
  storefrontLabel: z.string(),
  storefrontHref: z.string(),
  signOutLabel: z.string(),
  signInLabel: z.string(),
});

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
    props: z
      .object({
        title: z.string(),
        description: z.string().nullable().optional(),
        activeNav: z.string(),
      })
      .merge(adminShellNavSchema),
    slots: ["default"],
    description: "Admin dashboard shell with sidebar navigation",
  },
  MountAction: {
    props: z.object({
      action: z.string().min(1),
      params: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
    description: "Run a catalog action on mount (layout-declared data load)",
  },
  AuthSettingsForm: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      saveLabel: z.string(),
      savingLabel: z.string(),
      loadingLabel: z.string(),
      successMessage: z.string(),
      socialProvidersLegend: z.string(),
      configuredBadgeLabel: z.string(),
      saveHelperText: z.string(),
      allowPasswordLabel: z.string(),
      allowPasswordResetLabel: z.string(),
      allowSignUpLabel: z.string(),
      adminSecurityLegend: z.string(),
      requireMfaLabel: z.string(),
      mfaHelperText: z.string(),
      loginAppearanceLinkText: z.string(),
      googleLabel: z.string(),
      githubLabel: z.string(),
      appleLabel: z.string(),
      googleSecretPlaceholderNew: z.string(),
      googleSecretPlaceholderExisting: z.string(),
      githubSecretPlaceholderNew: z.string(),
      githubSecretPlaceholderExisting: z.string(),
      appleKeyPlaceholderNew: z.string(),
      appleKeyPlaceholderExisting: z.string(),
    }),
    description: "Per-org auth provider toggles and ZITADEL IdP configuration",
  },
  LoginBrandingForm: {
    props: z
      .object({
        title: z.string(),
        description: z.string().nullable(),
        segment: z.string(),
        previewLoginLabel: z.string(),
        draftSavedMessage: z.string(),
        publishedMessage: z.string(),
        loadingLabel: z.string(),
      })
      .merge(draftPublishLabelsSchema),
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
  UsersAdminForm: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      loadingLabel: z.string(),
      inviteSectionTitle: z.string(),
      inviteSectionDescription: z.string(),
      inviteLabel: z.string(),
      invitingLabel: z.string(),
      inviteSuccessMessage: z.string(),
      roleUpdatedMessage: z.string(),
      emptyTableMessage: z.string(),
      emailColumnHeader: z.string(),
      roleColumnHeader: z.string(),
      mfaColumnHeader: z.string(),
      statusColumnHeader: z.string(),
      mfaEnabledLabel: z.string(),
      mfaOffLabel: z.string(),
    }),
    description: "List and invite ZITADEL users for this org",
  },
  ContentEntryAdmin: {
    props: z
      .object({
        title: z.string(),
        description: z.string().nullable(),
        locale: z.string(),
        deleteLabel: z.string(),
        deletingLabel: z.string(),
        createDraftLabel: z.string(),
        creatingLabel: z.string(),
        loadingLabel: z.string(),
        entryCreatedMessage: z.string(),
        entrySavedMessage: z.string(),
        entryPublishedMessage: z.string(),
        entryDeletedMessage: z.string(),
        deleteConfirmMessage: z.string(),
      })
      .merge(draftPublishLabelsSchema)
      .merge(mediaFieldLabelsSchema),
    description: "Generic CMS entry list and form driven by content type schema",
  },
  LayoutEntryAdmin: {
    props: z
      .object({
        title: z.string(),
        description: z.string().nullable(),
        segment: z.string(),
        loadingLabel: z.string(),
        draftSavedMessage: z.string(),
        publishedMessage: z.string(),
      })
      .merge(draftPublishLabelsSchema),
    description: "Layout template list and JSON spec editor with publish",
  },
  AdminHome: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      links: z.array(adminLinkSchema),
    }),
    description: "Admin overview with links to platform settings",
  },
  PageRoutingAdmin: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      locale: z.string(),
      saveLabel: z.string(),
      savingLabel: z.string(),
      pageSavedMessage: z.string(),
      createLabel: z.string(),
      creatingLabel: z.string(),
      loadingLabel: z.string(),
      editUrlTreeLabel: z.string(),
      allPagesLinkLabel: z.string(),
      urlTreeLinkLabel: z.string(),
      saveTreeLabel: z.string(),
      savingTreeLabel: z.string(),
      treeSavedMessage: z.string(),
      addEntryLabel: z.string(),
      removeEntryLabel: z.string(),
      pageDocumentsLinkLabel: z.string(),
      treeLoadingLabel: z.string(),
    }),
    description: "Routing page list/editor and page_tree URL map",
  },
  PageTreeAdmin: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      locale: z.string(),
      saveTreeLabel: z.string(),
      savingTreeLabel: z.string(),
      treeSavedMessage: z.string(),
      addEntryLabel: z.string(),
      removeEntryLabel: z.string(),
      pageDocumentsLinkLabel: z.string(),
      treeLoadingLabel: z.string(),
    }),
    description: "Edit page_tree slug → pageId mappings",
  },
  PageEntryAdmin: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      saveLabel: z.string(),
      savingLabel: z.string(),
      pageSavedMessage: z.string(),
      createLabel: z.string(),
      creatingLabel: z.string(),
      loadingLabel: z.string(),
      editUrlTreeLabel: z.string(),
      allPagesLinkLabel: z.string(),
      urlTreeLinkLabel: z.string(),
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
      requireMfaForAdmin: z.boolean().optional(),
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
  listTeamUsers: {
    description: "List ZITADEL team members for this org",
  },
  inviteTeamUser: {
    params: z.object({
      email: z.string().email(),
      givenName: z.string().optional(),
      familyName: z.string().optional(),
      role: z.enum(["admin", "editor"]),
    }),
    description: "Invite a team member and assign a role",
  },
  updateTeamUserRole: {
    params: z.object({
      userId: z.string().min(1),
      role: z.enum(["admin", "editor"]),
    }),
    description: "Update a team member role",
  },
  listRoutingPages: {
    description: "List routing page documents",
  },
  loadRoutingPage: {
    params: z.object({
      pageKey: z.string().min(1),
    }),
    description: "Load one routing page document by key",
  },
  saveRoutingPage: {
    params: z.object({
      pageKey: z.string().min(1),
      layoutRef: z.string().min(1),
      contentRef: z.string().nullable().optional(),
    }),
    description: "Save a routing page document draft",
  },
  loadMainTree: {
    description: "Load the storefront URL page tree",
  },
  saveMainTree: {
    params: z.object({
      pages: z.array(
        z.object({
          id: z.string().min(1),
          pageId: z.string().min(1),
          slug: z.record(z.string(), z.string()),
        }),
      ),
    }),
    description: "Save the storefront URL page tree",
  },
};
