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

/** Platform admin panels — settings, CMS, routing, team, flags, replay. */
export const adminComponentSchemas = {
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
      authProvidersLinkText: z.string(),
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
  FeatureFlagsAdmin: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      loadingLabel: z.string(),
      emptyLabel: z.string(),
      onLabel: z.string(),
      offLabel: z.string(),
      togglingLabel: z.string(),
    }),
    description: "List and toggle feature flags for this org",
  },
  SessionReplayAdmin: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      loadingLabel: z.string(),
      emptyLabel: z.string(),
      sessionColumnHeader: z.string(),
      chunksColumnHeader: z.string(),
      lastSeenColumnHeader: z.string(),
      previewTitle: z.string(),
      previewLoadingLabel: z.string(),
      loadChunkLabel: z.string(),
      playSessionLabel: z.string(),
      playerLoadingLabel: z.string(),
      forbiddenLabel: z.string(),
      noChunksLabel: z.string(),
    }),
    description: "List session replay chunks for this org (admin only)",
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

export const adminActionSchemas = {
  saveAuthConfig: {
    params: z.object({
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
  deleteContentEntry: {
    params: z.object({
      contentType: z.string().min(1),
      id: z.string().min(1),
    }),
    description: "Delete a CMS content entry",
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
  listReplaySessions: {
    description: "List session replay summaries for this org (admin only)",
  },
  loadReplayChunk: {
    params: z.object({
      storageKey: z.string().min(1),
      sessionId: z.string().optional(),
    }),
    description: "Load one rrweb replay chunk by storage key",
  },
  playReplaySession: {
    params: z.object({
      sessionId: z.string().min(1),
      storageKeys: z.array(z.string().min(1)).min(1),
    }),
    description: "Load and merge all replay chunks for playback",
  },
  listFlags: {
    description: "List feature flags for this org",
  },
  toggleBooleanFlag: {
    params: z.object({
      flagId: z.string().min(1),
      value: z.boolean(),
    }),
    description: "Toggle a boolean feature flag",
  },
};
