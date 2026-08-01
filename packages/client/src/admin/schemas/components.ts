import { z } from "zod";
import { catalogProps } from "../../schemas/shared";
import { navItemConfigSchema } from "./shared";

const panelLabels = {
  title: z.string(),
  description: z.string().nullable(),
};

const adminShellLabels = {
  ...panelLabels,
  sidebarTitle: z.string(),
  productName: z.string(),
  settingsSectionLabel: z.string(),
  nav: z.record(z.string(), z.string()),
  settings: z.record(z.string(), z.string()),
  accountSecurity: z.string(),
  storefront: z.string(),
  signOut: z.string(),
  signIn: z.string(),
};

const adminShellConfig = {
  activeNav: z.string(),
  navItems: z.array(navItemConfigSchema),
  settingsItems: z.array(navItemConfigSchema),
  accountSecurityHref: z.string(),
  storefrontHref: z.string(),
};

/** Platform admin panels — settings, CMS, routing, team, flags, replay. */
export const adminComponentSchemas = {
  AdminShell: {
    props: catalogProps(adminShellLabels, adminShellConfig),
    slots: ["default"],
    description: "Admin dashboard shell with sidebar navigation",
  },
  AuthSettingsForm: {
    props: catalogProps(
      {
        ...panelLabels,
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
      },
      {},
    ),
    description: "Per-org auth provider toggles and ZITADEL IdP configuration",
  },
  LoginBrandingForm: {
    props: catalogProps(
      {
        ...panelLabels,
        previewLoginLabel: z.string(),
        draftSavedMessage: z.string(),
        publishedMessage: z.string(),
        loadingLabel: z.string(),
        saveLabel: z.string(),
        savingLabel: z.string(),
        publishLabel: z.string(),
        publishingLabel: z.string(),
      },
      {
        segment: z.string(),
      },
    ),
    description: "Structured editor for login layout branding props",
  },
  AccountSecurityForm: {
    props: catalogProps(
      {
        title: z.string().default("Account security"),
        description: z
          .string()
          .nullable()
          .default("Set up an authenticator app for two-factor sign-in."),
      },
      {},
    ),
    description: "TOTP enrollment for the signed-in user",
  },
  UsersAdminForm: {
    props: catalogProps(
      {
        ...panelLabels,
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
      },
      {},
    ),
    description: "List and invite ZITADEL users for this org",
  },
  FeatureFlagsAdmin: {
    props: catalogProps(
      {
        ...panelLabels,
        loadingLabel: z.string(),
        empty: z.string(),
        onLabel: z.string(),
        offLabel: z.string(),
        togglingLabel: z.string(),
      },
      {},
    ),
    description: "List and toggle feature flags for this org",
  },
  SessionReplayAdmin: {
    props: catalogProps(
      {
        ...panelLabels,
        loadingLabel: z.string(),
        empty: z.string(),
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
      },
      {},
    ),
    description: "List session replay chunks for this org (admin only)",
  },
  ContentEntryAdmin: {
    props: catalogProps(
      {
        ...panelLabels,
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
        saveLabel: z.string(),
        savingLabel: z.string(),
        publishLabel: z.string(),
        publishingLabel: z.string(),
        uploadFileLabel: z.string(),
        uploadingLabel: z.string(),
        pickExistingLabel: z.string(),
        loadingAssetsLabel: z.string(),
        clearLabel: z.string(),
      },
      {
        locale: z.string(),
      },
    ),
    description: "Generic CMS entry list and form driven by content type schema",
  },
  LayoutEntryAdmin: {
    props: catalogProps(
      {
        ...panelLabels,
        loadingLabel: z.string(),
        draftSavedMessage: z.string(),
        publishedMessage: z.string(),
        saveLabel: z.string(),
        savingLabel: z.string(),
        publishLabel: z.string(),
        publishingLabel: z.string(),
      },
      {
        segment: z.string(),
      },
    ),
    description: "Layout template list and JSON spec editor with publish",
  },
  AdminHome: {
    props: catalogProps(
      {
        ...panelLabels,
        links: z.record(
          z.string(),
          z.object({
            label: z.string(),
            description: z.string(),
          }),
        ),
      },
      {
        links: z.array(
          z.object({
            id: z.string(),
            href: z.string(),
          }),
        ),
      },
    ),
    description: "Admin overview with links to platform settings",
  },
  PageRoutingAdmin: {
    props: catalogProps(
      {
        ...panelLabels,
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
      },
      {
        locale: z.string(),
      },
    ),
    description: "Routing page list/editor and page_tree URL map",
  },
  PageTreeAdmin: {
    props: catalogProps(
      {
        ...panelLabels,
        saveTreeLabel: z.string(),
        savingTreeLabel: z.string(),
        treeSavedMessage: z.string(),
        addEntryLabel: z.string(),
        removeEntryLabel: z.string(),
        pageDocumentsLinkLabel: z.string(),
        treeLoadingLabel: z.string(),
      },
      {
        locale: z.string(),
      },
    ),
    description: "Edit page_tree slug → pageId mappings",
  },
  PageEntryAdmin: {
    props: catalogProps(
      {
        ...panelLabels,
        saveLabel: z.string(),
        savingLabel: z.string(),
        pageSavedMessage: z.string(),
        createLabel: z.string(),
        creatingLabel: z.string(),
        loadingLabel: z.string(),
        editUrlTreeLabel: z.string(),
        allPagesLinkLabel: z.string(),
        urlTreeLinkLabel: z.string(),
      },
      {},
    ),
    description: "Edit routing page documents (layoutRef, contentRef)",
  },
};

export { draftPublishLabelsSchema, mediaFieldLabelsSchema } from "../../schemas/shared";
