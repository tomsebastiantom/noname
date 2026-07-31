import { z } from "zod";
import {
  adminLinkSchema,
  adminShellNavSchema,
  draftPublishLabelsSchema,
  mediaFieldLabelsSchema,
} from "./shared";

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
