/**
 * Seeds a minimal platform demo: published layouts, admin UI, team users, Keto scope.
 * Run with API server up: pnpm seed:demo
 * Requires: pnpm init:zitadel (sets ZITADEL org id as org_id)
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LOGIN_FORM_MESSAGES,
  DEFAULT_LOGIN_FORM_VIEWS,
} from "../../packages/client/src/core/login-form-labels";
import { loginWithCredentials } from "../../packages/server/src/domains/auth/adapters/zitadel/client";
import { upsertUserTeamRole } from "../../packages/server/src/domains/auth/adapters/zitadel/authorizations";
import { findUserIdByEmail } from "../../packages/server/src/domains/auth/adapters/zitadel/users";
import { seedDemoTeamAndScope, subFromAccessToken } from "./demo-users";
import { seedOrgEditorAccess } from "./keto-tuples";
import { agentTaskCompleteEmailSpec, welcomeEmailSpec } from "./email-specs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "../..");

/** Re-read .env on each seed run (picks up init:zitadel without restarting this process). */
function reloadSeedEnv(): void {
  loadEnv({ path: join(repoRoot, ".env"), override: true });
}

let demoOrgId = "";
const DEMO_STORE_SLUG = "yogastore";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

function catalogProps<TConfig extends Record<string, unknown>, TLabels extends Record<string, unknown>>(
  config: TConfig,
  labels: TLabels,
) {
  return { config, labels };
}

const loginViewLabels = DEFAULT_LOGIN_FORM_VIEWS;

const loginSpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: catalogProps(
        { layout: "centered" },
        { brandTitle: "Noname", brandSubtitle: "Platform demo" },
      ),
      children: ["form"],
    },
    form: {
      type: "LoginForm",
      props: catalogProps(
        {
          redirectPath: "/",
          logoUrl: null,
          showPasswordToggle: true,
          providers: ["google"],
        },
        {
          views: loginViewLabels,
          footerText: null,
          providers: { google: "Continue with Google" },
          messages: DEFAULT_LOGIN_FORM_MESSAGES,
        },
      ),
    },
  },
};

const demoSpec = {
  root: "main",
  elements: {
    main: {
      type: "Stack",
      props: catalogProps({ direction: "column", gap: 24, align: "stretch" }, {}),
      children: ["header", "promo", "intro", "actions"],
    },
    promo: {
      type: "Text",
      visible: { $state: "/flags/show_summer_sale" },
      props: catalogProps(
        { variant: "h3", align: "center" },
        { content: "Summer sale — 20% off yoga mats this week!" },
      ),
    },
    header: {
      type: "Text",
      props: catalogProps({ variant: "h1", align: "center" }, { content: "Welcome to Noname" }),
    },
    intro: {
      type: "Text",
      props: catalogProps(
        { variant: "body", align: "center" },
        {
          content:
            "Platform demo — core layout components only. Enable an extension via catalog manifest for domain-specific UI.",
        },
      ),
    },
    actions: {
      type: "Stack",
      props: catalogProps({ direction: "row", gap: 12, align: "center" }, {}),
      children: ["cta"],
    },
    cta: {
      type: "Button",
      props: catalogProps({ variant: "primary", action: null }, { text: "Get started" }),
    },
  },
};

const adminShellNavConfig = {
  navItems: [
    { id: "home", href: "/admin" },
    { id: "pages", href: "/admin/pages" },
    { id: "content", href: "/admin/content" },
    { id: "layout", href: "/admin/layout" },
  ],
  settingsItems: [
    { id: "auth", href: "/admin/settings/auth" },
    { id: "integrations", href: "/admin/settings/integrations" },
    { id: "users", href: "/admin/settings/users" },
    { id: "scope", href: "/admin/settings/scope" },
    { id: "login", href: "/admin/settings/login" },
    { id: "agents", href: "/admin/settings/agents" },
  ],
  observabilityItems: [
    { id: "analytics", href: "/admin/settings/analytics" },
    { id: "flags", href: "/admin/settings/flags" },
    { id: "replay", href: "/admin/settings/replay" },
  ],
  accountSecurityHref: "/admin/settings/security",
  storefrontHref: "/",
};

const adminShellNavLabels = {
  sidebarTitle: "Admin",
  productName: "Noname",
  settingsSectionLabel: "Settings",
  observabilitySectionLabel: "Observability",
  nav: {
    home: "Overview",
    pages: "Pages",
    content: "Content",
    layout: "Layouts",
  },
  settings: {
    auth: "Auth settings",
    integrations: "Integrations",
    users: "Team members",
    scope: "Content access",
    login: "Login appearance",
    agents: "Agents",
  },
  observability: {
    analytics: "Analytics",
    flags: "Feature flags",
    replay: "Session replay",
  },
  accountSectionLabel: "Account",
  accountSecurity: "Account security",
  storefront: "← Site",
  signOut: "Sign out",
  signIn: "Sign in",
};

const draftPublishLabels = {
  saveLabel: "Save draft",
  savingLabel: "Saving…",
  publishLabel: "Save & publish",
  publishingLabel: "Publishing…",
};

const documentFolderLabels = {
  folderLabel: "Folder",
  folderPlaceholder: "Marketing",
  folderNoneLabel: "No folder",
  folderHint:
    "One folder per document. Team access is granted on folders in Settings → Content access.",
};

const documentShareLabels = {
  shareTitle: "Share with",
  shareHint: "Give a team member edit access to this document only.",
  shareUserLabel: "Team member",
  shareGrantLabel: "Share",
  shareGrantingLabel: "Sharing…",
  shareRevokeLabel: "Remove",
  shareRevokingLabel: "Removing…",
  shareGrantSuccessMessage: "Access granted.",
  shareRevokeSuccessMessage: "Access removed.",
  shareEmptyMessage: "Not shared with anyone directly yet.",
  shareLoadingLabel: "Loading share list…",
};

const documentPublisherShareLabels = {
  publisherShareTitle: "Publish access",
  publisherShareHint: "Grant publish permission on this document only.",
  publisherShareUserLabel: "Team member",
  publisherShareGrantLabel: "Grant publish",
  publisherShareGrantingLabel: "Granting…",
  publisherShareRevokeLabel: "Remove",
  publisherShareRevokingLabel: "Removing…",
  publisherShareGrantSuccessMessage: "Publish access granted.",
  publisherShareRevokeSuccessMessage: "Publish access removed.",
  publisherShareEmptyMessage: "No direct publish grants yet.",
  publisherShareLoadingLabel: "Loading publish access…",
};

const mediaFieldLabels = {
  uploadFileLabel: "Upload file",
  uploadingLabel: "Uploading…",
  pickExistingLabel: "Pick existing",
  loadingAssetsLabel: "Loading…",
  clearLabel: "Clear",
};

const referenceFieldLabels = {
  entriesLoadingLabel: "Loading entries…",
  emptyLabel: "No {type} entries yet.",
  selectedPrefix: "Selected:",
  missingTargetMessage: 'Reference field "{label}" is missing schema references (target content type).',
};

const accountSecurityLabels = {
  title: "Two-factor authentication",
  description: "Use an authenticator app for an extra sign-in step after your password.",
  signInRequiredDescription: "Sign in to manage your account security settings.",
  signInLinkLabel: "Sign in →",
  backToStorefrontLabel: "← Back to storefront",
  enabledBadgeLabel: "Enabled",
  enabledDescription: "Your account is protected with an authenticator app.",
  checkingLabel: "Checking security settings…",
  mfaRequiredAlert:
    "Your store requires an authenticator app before you can use the admin dashboard.",
  idleDescription: "Add an authenticator app for an extra sign-in step after your password.",
  idleButtonLabel: "Set up authenticator app",
  idleButtonPendingLabel: "Starting…",
  setupDescription:
    "Scan the QR code with Google Authenticator, Authy, or a similar app. Or enter the secret manually.",
  qrAltText: "TOTP QR code",
  verificationCodeLabel: "Verification code",
  verificationCodePlaceholder: "123456",
  confirmSetupLabel: "Confirm setup",
  confirmSetupPendingLabel: "Verifying…",
  enabledStepDescription:
    "Sign-in may ask for a code from your authenticator app after your password.",
  continueToAdminLabel: "Continue to admin →",
};

const authSettingsLabels = {
  saveLabel: "Save settings",
  savingLabel: "Saving…",
  loadingLabel: "Loading auth settings…",
  successMessage: "Auth settings saved.",
  socialProvidersLegend: "Social providers",
  configuredBadgeLabel: "Configured in ZITADEL",
  saveHelperText:
    "Save registers providers in ZITADEL for this org and stores IdP references in platform settings. Secrets are never returned to the browser after save.",
  authProvidersLinkText:
    "Manage provider enable, button label, and icon in Content → auth_provider.",
  allowPasswordLabel: "Allow email and password sign-in",
  allowPasswordResetLabel: "Allow forgot-password reset emails",
  allowSignUpLabel: "Allow customers to create accounts on /login",
  adminSecurityLegend: "Admin security",
  requireMfaLabel: "Require authenticator app (MFA) for admin access",
  mfaHelperText:
    "When enabled, team members must enroll at Account security before using /admin.",
  loginAppearanceLinkText: "Edit login appearance — title, logo, and brand copy on /login.",
  googleLabel: "Google",
  githubLabel: "GitHub",
  appleLabel: "Apple",
  googleSecretPlaceholderNew: "From Google Cloud Console",
  googleSecretPlaceholderExisting: "Leave blank to keep existing secret",
  githubSecretPlaceholderNew: "From GitHub OAuth app",
  githubSecretPlaceholderExisting: "Leave blank to keep existing secret",
  appleKeyPlaceholderNew: "Paste contents of AuthKey_XXXX.p8",
  appleKeyPlaceholderExisting: "Leave blank to keep existing key",
  forbiddenLabel: "Auth settings require the store admin role.",
};

const integrationsCommsDeliveriesLabels = {
  loadingLabel: "Loading deliveries…",
  forbiddenLabel: "Integrations settings require the store admin role.",
  emptyLabel: "No deliveries yet.",
  refreshLabel: "Refresh",
  retryLabel: "Retry",
  retryingLabel: "Retrying…",
  statusFilterLabel: "Status",
  allStatusesLabel: "All",
  columns: {
    when: "When",
    status: "Status",
    to: "To",
    subject: "Subject",
    trigger: "Trigger",
    attempts: "Attempts",
    engagement: "Engagement",
    actions: "Actions",
  },
};

const integrationsCommsInboxLabels = {
  loadingLabel: "Loading inbox…",
  forbiddenLabel: "Integrations settings require the store admin role.",
  emptyLabel: "No notifications yet.",
  refreshLabel: "Refresh",
  unreadOnlyLabel: "Unread",
  allLabel: "All",
  markReadLabel: "Mark read",
  columns: {
    when: "When",
    title: "Message",
    trigger: "Trigger",
    status: "Status",
    actions: "Actions",
  },
};

const accountNotificationsLabels = {
  title: "Notifications",
  description: "Order updates and account messages for your signed-in user.",
  ...integrationsCommsInboxLabels,
  forbiddenLabel: "Sign in to view your notifications.",
};

const integrationsWebhooksLabels = {
  loadingLabel: "Loading webhooks…",
  forbiddenLabel: "Integrations settings require the store admin role.",
  emptyLabel: "No webhook subscriptions yet.",
  refreshLabel: "Refresh",
  urlLabel: "Endpoint URL",
  eventTypesLabel: "Event types",
  eventTypesHelper: "Comma-separated. Use * to receive all event types.",
  descriptionLabel: "Description (optional)",
  createLabel: "Add subscription",
  creatingLabel: "Adding…",
  deleteLabel: "Delete",
  deletingLabel: "Deleting…",
  enabledLabel: "Enabled",
  disabledLabel: "Disabled",
  signingSecretLabel: "Signing secret is generated automatically and stored in Vault.",
  deliveriesTitle: "Outbound delivery log",
  deliveriesEmptyLabel: "No outbound deliveries yet.",
  retryLabel: "Retry",
  retryingLabel: "Retrying…",
  columns: {
    url: "URL",
    events: "Events",
    status: "Status",
    failures: "Failures",
    actions: "Actions",
    when: "When",
    eventType: "Event",
    attempts: "Attempts",
    httpStatus: "HTTP",
  },
};

const integrationsCommsLabels = {
  loadingLabel: "Loading comms settings…",
  forbiddenLabel: "Integrations settings require the store admin role.",
  providerLabel: "Email provider",
  apiKeyLabel: "API key (optional BYOK)",
  apiKeyPlaceholderNew: "Paste Resend or Twilio key",
  apiKeyPlaceholderExisting: "Leave blank to keep existing key",
  configuredBadgeLabel: "Org key stored in Vault",
  fromEmailLabel: "From email",
  fromNameLabel: "From name",
  saveLabel: "Save comms settings",
  savingLabel: "Saving…",
  successMessage: "Comms settings saved.",
};

const integrationsLlmLabels = {
  loadingLabel: "Loading LLM settings…",
  forbiddenLabel: "Integrations settings require the store admin role.",
  providerLabel: "LLM provider",
  apiKeyLabel: "API key (optional BYOK)",
  apiKeyPlaceholderNew: "Paste OpenAI or Anthropic key",
  apiKeyPlaceholderExisting: "Leave blank to keep existing key",
  configuredBadgeLabel: "Org key stored in Vault",
  allowPlatformFallbackLabel: "Allow platform fallback key",
  allowPlatformFallbackHelper:
    "When enabled, use the platform OpenAI/Anthropic env key if no org key is set.",
  saveLabel: "Save LLM settings",
  savingLabel: "Saving…",
  successMessage: "LLM settings saved.",
};

const integrationsOAuthLabels = {
  loadingLabel: "Loading external integrations…",
  forbiddenLabel: "Integrations settings require the store admin role.",
  connectLabel: "Connect",
  connectingLabel: "Opening connect…",
  connectedLabel: "Connected",
  notConfiguredLabel: "External integrations are not available on this server yet.",
  emptyLabel: "No external integrations are available for this organization yet.",
  refreshLabel: "Refresh status",
  connectionIdLabel: "Connection ID",
  providerLabel: "Provider",
};

const usersAdminLabels = {
  loadingLabel: "Loading team members…",
  inviteSectionTitle: "Invite team member",
  inviteSectionDescription: "They receive an email to set their password.",
  inviteLabel: "Send invite",
  invitingLabel: "Sending invite…",
  inviteSuccessMessage: "Invite sent — they will receive an email to set their password.",
  roleUpdatedMessage: "Role updated.",
  emptyTableMessage: "No team members yet.",
  emailColumnHeader: "Email",
  roleColumnHeader: "Role",
  mfaColumnHeader: "MFA",
  statusColumnHeader: "Status",
  mfaEnabledLabel: "Enabled",
  mfaOffLabel: "Off",
  forbiddenLabel: "Team members require store admin or access manager role.",
};

const sessionReplayAdminLabels = {
  loadingLabel: "Loading replay sessions…",
  empty: "No replay sessions yet. Browse the storefront with replay enabled to record sessions.",
  sessionColumnHeader: "Session",
  userColumnHeader: "User",
  chunksColumnHeader: "Chunks",
  lastSeenColumnHeader: "Last activity",
  searchPlaceholder: "User id or email",
  searchLabel: "Search",
  clearSearchLabel: "Clear",
  identifiedMidSessionLabel: "Identified mid-session",
  previewTitle: "Session detail",
  previewLoadingLabel: "Loading chunk…",
  loadChunkLabel: "Load chunk",
  playSessionLabel: "Play session",
  playerLoadingLabel: "Loading replay…",
  forbiddenLabel: "Session replay requires the replay viewer or store admin role.",
  noChunksLabel: "No stored chunks for this session.",
};

const analyticsEventsAdminLabels = {
  loadingLabel: "Loading analytics…",
  emptyEvents: "No events yet. Browse the storefront to generate analytics.",
  emptyAggregations: "No aggregations yet.",
  refreshLabel: "Refresh",
  refreshingLabel: "Refreshing…",
  forbiddenLabel: "Analytics requires the analyst or store admin role.",
  aggregationsTitle: "Events by type",
  aggregationsDescription: "Counts grouped by event type for this org.",
  eventsTitle: "Recent events",
  eventsDescription: "Latest tracked events (up to 50).",
  eventTypeColumnHeader: "Event type",
  countColumnHeader: "Count",
  timestampColumnHeader: "Time",
  sourceColumnHeader: "Source",
  sessionColumnHeader: "Session",
  schemaColumnHeader: "Schema",
};

const loginBrandingLabels = {
  ...draftPublishLabels,
  previewLoginLabel: "Preview login",
  draftSavedMessage: "Login appearance saved as draft.",
  publishedMessage: "Login appearance published.",
  loadingLabel: "Loading login layout…",
  forbiddenLabel: "Login appearance requires the store admin role.",
};

const contentAdminLabels = {
  ...draftPublishLabels,
  ...mediaFieldLabels,
  ...referenceFieldLabels,
  ...documentFolderLabels,
  ...documentShareLabels,
  ...documentPublisherShareLabels,
  deleteLabel: "Delete",
  deletingLabel: "Deleting…",
  createDraftLabel: "Create draft",
  creatingLabel: "Creating…",
  loadingLabel: "Loading content…",
  entryCreatedMessage: "Entry created as draft.",
  entrySavedMessage: "Entry saved as draft.",
  entryPublishedMessage: "Entry published.",
  entryDeletedMessage: "Entry deleted.",
  deleteConfirmMessage: "Delete this entry? This cannot be undone.",
  forbiddenLabel: "Content admin requires draft write access.",
};

const layoutAdminLabels = {
  ...draftPublishLabels,
  ...documentFolderLabels,
  ...documentShareLabels,
  ...documentPublisherShareLabels,
  loadingLabel: "Loading layouts…",
  draftSavedMessage: "Layout saved as draft.",
  publishedMessage: "Layout published. Site and login will use the new spec on next load.",
  forbiddenLabel: "Layout admin requires draft write access.",
  allLayoutsLinkLabel: "← All layouts",
  contentRefLabel: "contentRef (optional)",
  contentRefPlaceholder: "product:uuid or page:uuid — CMS merge on storefront",
  contentRefHint: "Storefront templates only. Login/admin specs usually leave this empty.",
  specJsonLabel: "json-render spec (JSON)",
  templateMetaTemplateLabel: "Template:",
  templateMetaSegmentLabel: "Segment:",
  templateMetaStatusLabel: "Status:",
  metaSeparator: "·",
  emptyLayoutsMessage: "No layout templates yet. Seed with pnpm seed:demo.",
  templateColumnHeader: "Template",
  statusColumnHeader: "Status",
  contentRefColumnHeader: "Content ref",
  hasContentRefYes: "Yes",
  templateNotFoundPrefix: "Template",
  templateNotFoundSuffix: "not found.",
};

const pageEntryAdminLabels = {
  saveLabel: "Save",
  savingLabel: "Saving…",
  pageSavedMessage: "Page document saved.",
  createLabel: "Create",
  creatingLabel: "Creating…",
  loadingLabel: "Loading pages…",
  editUrlTreeLabel: "Edit URL tree →",
  allPagesLinkLabel: "← All pages",
  urlTreeLinkLabel: "URL tree",
  pageKeyLabel: "Page key",
  statusSeparator: " · ",
  layoutRefLabel: "Layout template",
  layoutRefPlaceholder: "home",
  contentRefLabel: "Content ref",
  contentRefPlaceholder: "page:uuid or product:uuid",
  contentRefHint: "Optional. Format: type:id — merged into layout via $state on the edge.",
  newPageTitle: "New page document",
  newPageDescription: "Key used by page_tree entries (e.g. home, product-demo)",
  newPageKeyLabel: "Page key",
  newPageKeyPlaceholder: "about",
  emptyListMessage: "No routing page documents yet.",
  pageKeyColumnHeader: "Page key",
  layoutColumnHeader: "Layout",
  contentRefColumnHeader: "Content ref",
  statusColumnHeader: "Status",
  pageNotFoundPrefix: "Page",
  pageNotFoundSuffix: "not found.",
  forbiddenLabel: "Page admin requires draft write access.",
};

const pageTreeAdminLabels = {
  saveTreeLabel: "Save page tree",
  savingTreeLabel: "Saving…",
  treeSavedMessage: "Page tree saved.",
  addEntryLabel: "Add entry",
  removeEntryLabel: "Remove entry",
  pageDocumentsLinkLabel: "← Page documents",
  treeLoadingLabel: "Loading page tree…",
  forbiddenLabel: "Page tree admin requires draft write access.",
};

const featureFlagsAdminLabels = {
  loadingLabel: "Loading flags…",
  empty: "No flags yet.",
  onLabel: "On",
  offLabel: "Off",
  togglingLabel: "Saving…",
  forbiddenLabel: "Feature flags require the flags manager or store admin role.",
};

const adminHomeLinkConfig = [
  { id: "pages", href: "/admin/pages" },
  { id: "auth_providers", href: "/admin/content/auth_provider" },
  { id: "layout", href: "/admin/layout" },
  { id: "users", href: "/admin/settings/users" },
  { id: "scope", href: "/admin/settings/scope" },
  { id: "analytics", href: "/admin/settings/analytics" },
  { id: "flags", href: "/admin/settings/flags" },
  { id: "replay", href: "/admin/settings/replay" },
  { id: "auth", href: "/admin/settings/auth" },
  { id: "integrations", href: "/admin/settings/integrations" },
  { id: "account_security", href: "/admin/settings/security" },
  { id: "login", href: "/admin/settings/login" },
  { id: "agents", href: "/admin/settings/agents" },
];

const adminHomeLinkLabels: Record<string, { label: string; description: string }> = {
  pages: { label: "Pages", description: "URL tree and routing page documents" },
  auth_providers: {
    label: "Identity providers",
    description: "Custom OAuth/OIDC providers (schema-driven CMS entries)",
  },
  layout: { label: "Layouts", description: "Edit json-render templates (home, login, …)" },
  users: {
    label: "Team members",
    description: "Invite staff, assign roles (admin: any; access manager: all except admin), view MFA status",
  },
  scope: {
    label: "Content access",
    description: "Folders, teams, and who can edit scoped content",
  },
  analytics: {
    label: "Analytics",
    description: "Recent storefront events and counts by event type",
  },
  flags: {
    label: "Feature flags",
    description: "Toggle storefront features live (SSE + json-render)",
  },
  replay: {
    label: "Session replay",
    description: "Browse recorded browser sessions (replay viewer or admin)",
  },
  auth: {
    label: "Auth settings",
    description: "Social login (Google, GitHub, Apple) and password toggle",
  },
  account_security: {
    label: "Account security",
    description: "Set up authenticator app (two-factor sign-in)",
  },
  login: {
    label: "Login appearance",
    description: "Title, logo, and brand copy on /login",
  },
  agents: {
    label: "Agents",
    description: "Register delegated agents, mint tokens, and review completed tasks",
  },
};

function adminPanelSpec(
  children: string[],
  elements: Record<string, unknown>,
): Record<string, unknown> {
  return {
    root: "panel",
    elements: {
      panel: {
        type: "Stack",
        props: catalogProps({ direction: "column", gap: 16, align: "stretch" }, {}),
        children,
      },
      ...elements,
    },
  };
}

const adminShellSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: catalogProps(adminShellNavConfig, {
        title: "Admin",
        ...adminShellNavLabels,
      }),
      children: [],
    },
  },
};

/** Spec-driven editor chrome labels (loaded by client via loadEditorShellLabels). */
const visualEditorShellSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "VisualEditorShell",
      props: catalogProps(
        { templateName: "", pageContentRef: null },
        {
          title: "Edit page",
          exitEditLabel: "Exit edit",
          discardLabel: "Discard",
          unsavedLabel: "Unsaved changes",
          draftSavedLabel: "Draft saved",
          publishedLabel: "Published",
          saveLabel: "Save draft",
          savingLabel: "Saving…",
          publishLabel: "Publish",
          publishingLabel: "Publishing…",
          publishAdminOnlyHint: "Publish (admin only)",
          chromeRailTitle: "Editor tools",
          hideToolbarLabel: "Hide editor toolbar",
          saveHelpText: "Saves layout changes and page content fields.",
          pendingBlockHelpText:
            "For a new block preview, use Save to page in the right panel first (or Save draft commits it too).",
          uploadFileLabel: "Upload file",
          uploadingLabel: "Uploading…",
          pickExistingLabel: "Pick existing",
          loadingAssetsLabel: "Loading assets…",
          clearLabel: "Clear",
          layoutBadgeLabel: "Layout",
          contentBadgeLabel: "Content",
          scopeLayoutTitle: "Layout template:",
          scopeLayoutBody:
            "block structure and layout fields apply to all pages using this template.",
          scopeContentTitle: "Page content:",
          scopeContentBody:
            "fields marked Content in the panel save for this page only.",
          scopeNoContentBody:
            "This page has no linked content entry — all fields save to the layout.",
          propsSelectBlockHint:
            "Select a block on the page, or drop one from the palette. Use Save to page in this panel for new blocks; Save draft in the top bar for everything else.",
          propsElementMissing: "Selected element not found in layout.",
          propsNoFieldsHint: "No editor fields for this component yet.",
          propsPendingHint: "Preview only — not saved until you commit.",
          propsSaveToPageLabel: "Save to page",
          propsSavingLabel: "Saving…",
          propsSaveToPageHelp:
            "Commits this block to the layout and runs the same save as Save draft above.",
          propsCancelLabel: "Cancel",
          propsDuplicateLabel: "Duplicate block",
          propsRemoveLabel: "Remove from layout",
          propsRemoveHelp:
            "Removes this block from the page layout when you save. Does not delete CMS content.",
          propsNoContentRef: "This page has no content entry linked.",
          propsLoadingContent: "Loading content…",
          propsFieldSaveHint: "Saved with Save draft in the top bar.",
          blocksPanelTitle: "Blocks",
          layersPanelTitle: "Layers",
          propertiesPanelTitle: "Properties",
          hideLayersLabel: "Hide layers",
          showLayersLabel: "Show layers",
          hideBlocksLabel: "Hide blocks",
          layerTreePendingBadge: "draft",
          layerTreeDragTemplate: "Drag {label}",
          layerTreeExpandTemplate: "Expand {label} children",
          layerTreeCollapseTemplate: "Collapse {label} children",
          loadingLayoutHint: "Loading layout for edit…",
          loadingEditorHint: "Loading editor…",
          labelsMissingHint:
            "Editor chrome labels missing — seed or publish the visual_editor layout (VisualEditorShell.props.labels).",
          closePanelLabel: "Close",
          leftPanelsAriaLabel: "Left panels",
          rightPanelsAriaLabel: "Right panels",
          resizePanelAriaLabel: "Resize panel",
          chromeRailAriaLabel: "Editor toolbar collapsed",
          chromeRailSaveErrorTitle: "Save error — expand to view",
          publishPermissionTitle: "Publish requires admin permission",
          propsBlockSuffix: "block",
          paletteCatalogSuffix: "in catalog · drag blocks into Pinned to keep them handy.",
          palettePinnedAriaLabel: "Pinned blocks — drop here to pin",
          palettePinnedTitle: "Pinned",
          palettePinnedEmpty: "Drop a block here to pin it.",
          palettePinsLoading: "Loading pins…",
          paletteAllBlocksTitle: "All blocks",
          paletteFilterPlaceholder: "Filter all blocks…",
          paletteFilterAriaLabel: "Filter all blocks",
          paletteNoMatchPrefix: "No blocks match",
          paletteAllPinnedHint: "Every block is pinned — unpin one to see it here.",
          paletteUnpinLabel: "Unpin",
          paletteDragToAddHint: "Drag to canvas or into Pinned, or click to add",
          palettePinOnlyHint: "Drag to pin; add editor defaults to use on canvas.",
          layerTreeAriaLabel: "Layer tree",
          layerTreeHint: "Drag ⠿ left to reorder. Chevron right expands or collapses children.",
          layerTreeEmpty: "No layout structure loaded.",
          layerTreeRootMissing: "Layout root missing.",
          layerTreeExpandedTitle: "Expanded",
          layerTreeCollapsedTitle: "Collapsed",
          canvasAriaLabel:
            "Visual editor canvas — click a block to select it, Delete to remove, or drop a block from the palette",
          canvasBlockFallbackLabel: "Block",
          dropInsideEmptyTemplate: "Drop {block} inside {parent}",
          dropAtTopTemplate: "Drop {block} at top of {parent}",
          dropAtBottomTemplate: "Drop {block} at bottom of {parent}",
          dropAtSlotTemplate: "Drop {block} — slot {slot} in {parent}",
          saveConflictMessage:
            "Someone else saved this layout — refresh to see their changes.",
          refreshLayoutLabel: "Refresh",
          previewBarAriaLabel: "Canvas preview width",
          previewFullLabel: "Desktop",
          previewTabletLabel: "Tablet",
          previewMobileLabel: "Mobile",
          actionNoneLabel: "None",
        },
      ),
      children: ["palette", "layers", "canvas", "panel"],
    },
    palette: {
      type: "EditorPalette",
      props: catalogProps({}, {}),
      children: [],
    },
    layers: {
      type: "EditorLayerTree",
      props: catalogProps({}, {}),
      children: [],
    },
    canvas: {
      type: "EditorCanvas",
      props: catalogProps({}, {}),
      children: [],
    },
    panel: {
      type: "EditorPropsPanel",
      props: catalogProps({}, {}),
      children: [],
    },
  },
};

function panelProps(
  config: Record<string, unknown>,
  title: string,
  description: string | null,
  labels: Record<string, unknown>,
): Record<string, unknown> {
  return catalogProps(config, { title, description, ...labels });
}

const adminDashboardSpec = adminPanelSpec(["authSettings"], {
  authSettings: {
    type: "AuthSettingsForm",
    props: panelProps(
      {},
      "Sign-in methods",
      "Enable Google, GitHub, or Apple sign-in. Save registers IdPs in ZITADEL and updates platform settings for this org.",
      authSettingsLabels,
    ),
  },
});

const adminIntegrationsSpec = adminPanelSpec(
  ["sectionLlm", "sectionComms", "sectionInbox", "sectionWebhooks", "sectionOAuth"],
  {
    sectionLlm: {
      type: "AdminCollapsibleSection",
      props: catalogProps(
        { defaultOpen: true },
        {
          title: "AI & LLM",
          description: "Provider choice and org BYOK keys stored in Vault.",
        },
      ),
      children: ["loadIntegrationsLlm", "integrationsLlm"],
    },
    sectionComms: {
      type: "AdminCollapsibleSection",
      props: catalogProps(
        { defaultOpen: false },
        {
          title: "Email & delivery",
          description: "Transactional email provider, delivery log, and retries.",
        },
      ),
      children: ["loadIntegrationsComms", "integrationsComms", "loadCommsDeliveries", "commsDeliveries"],
    },
    sectionInbox: {
      type: "AdminCollapsibleSection",
      props: catalogProps(
        { defaultOpen: false },
        {
          title: "In-app inbox",
          description: "Preview of your signed-in user's inbox feed (same as Account → Notifications).",
        },
      ),
      children: ["loadCommsInbox", "commsInbox"],
    },
    sectionWebhooks: {
      type: "AdminCollapsibleSection",
      props: catalogProps(
        { defaultOpen: false },
        {
          title: "Webhooks",
          description: "Outbound HTTPS subscriptions and delivery log.",
        },
      ),
      children: ["loadWebhookSubscriptions", "webhookSubscriptions"],
    },
    sectionOAuth: {
      type: "AdminCollapsibleSection",
      props: catalogProps(
        { defaultOpen: false },
        {
          title: "External OAuth",
          description: "Third-party connections via Nango (when enabled on server).",
        },
      ),
      children: ["loadIntegrationsOAuth", "integrationsOAuth"],
    },
    loadIntegrationsLlm: {
      type: "MountAction",
      props: catalogProps({ action: "loadIntegrationsLlm" }, {}),
    },
    integrationsLlm: {
      type: "IntegrationsLlmForm",
      props: panelProps(
        {},
        "LLM integration",
        "Choose OpenAI or Anthropic and optionally bring your own API key. Keys are stored in Vault — never returned to the browser.",
        integrationsLlmLabels,
      ),
    },
    loadIntegrationsComms: {
      type: "MountAction",
      props: catalogProps({ action: "loadIntegrationsComms" }, {}),
    },
    integrationsComms: {
      type: "IntegrationsCommsForm",
      props: panelProps(
        {},
        "Email / comms",
        "Configure Resend or Twilio for transactional email. API keys go to Vault; from-address stays in tenant settings.",
        integrationsCommsLabels,
      ),
    },
    loadCommsDeliveries: {
      type: "MountAction",
      props: catalogProps({ action: "loadCommsDeliveries" }, {}),
    },
    commsDeliveries: {
      type: "CommsDeliveriesAdmin",
      props: panelProps(
        {},
        "Delivery log",
        "Recent outbound email for this organization. Retry failed deliveries after fixing provider credentials.",
        integrationsCommsDeliveriesLabels,
      ),
    },
    loadCommsInbox: {
      type: "MountAction",
      props: catalogProps({ action: "loadCommsInbox" }, {}),
    },
    commsInbox: {
      type: "CommsInboxAdmin",
      props: panelProps(
        {},
        "In-app inbox",
        "Your signed-in user's in-app notifications (same feed as Account → Notifications). Org delivery config is above; use the storefront account page for end-customer inbox.",
        integrationsCommsInboxLabels,
      ),
    },
    loadWebhookSubscriptions: {
      type: "MountAction",
      props: catalogProps({ action: "loadWebhookSubscriptions" }, {}),
    },
    webhookSubscriptions: {
      type: "WebhookSubscriptionsAdmin",
      props: panelProps(
        {},
        "Outbound webhooks",
        "Register HTTPS endpoints that receive signed JSON events from this organization.",
        integrationsWebhooksLabels,
      ),
    },
    loadIntegrationsOAuth: {
      type: "MountAction",
      props: catalogProps({ action: "loadIntegrationsOAuth" }, {}),
    },
    integrationsOAuth: {
      type: "IntegrationsOAuthForm",
      props: panelProps(
        {},
        "External integrations",
        "Connect third-party services for this organization. Available apps and logos are loaded automatically — only connection references are stored here; credentials stay encrypted off-platform.",
        integrationsOAuthLabels,
      ),
    },
  },
);

const adminFlagsSpec = adminPanelSpec(["loadFlags", "flagsAdmin"], {
  loadFlags: {
    type: "MountAction",
    props: catalogProps({ action: "listFlags" }, {}),
  },
  flagsAdmin: {
    type: "FeatureFlagsAdmin",
    props: panelProps(
      {},
      "Feature flags",
      "Boolean flags update the site instantly. Layout-bound flags re-fetch the page.",
      featureFlagsAdminLabels,
    ),
  },
});

const adminReplaySpec = adminPanelSpec(["loadReplay", "replayAdmin"], {
  loadReplay: {
    type: "MountAction",
    props: catalogProps({ action: "listReplaySessions" }, {}),
  },
  replayAdmin: {
    type: "SessionReplayAdmin",
    props: panelProps(
      {},
      "Session replay",
      "Sessions are grouped from analytics chunks. Select a row to inspect stored rrweb events.",
      sessionReplayAdminLabels,
    ),
  },
});

const adminAnalyticsSpec = adminPanelSpec(["loadAnalytics", "analyticsAdmin"], {
  loadAnalytics: {
    type: "MountAction",
    props: catalogProps({ action: "loadAnalyticsAdmin" }, {}),
  },
  analyticsAdmin: {
    type: "AnalyticsEventsAdmin",
    props: panelProps(
      {},
      "Analytics",
      "Browse tracked storefront events and summary counts by event type.",
      analyticsEventsAdminLabels,
    ),
  },
});

const scopeAdminLabels = {
  loadingLabel: "Loading…",
  folderLabel: "Folder",
  folderPlaceholder: "e.g. legal",
  folderSelectLabel: "Select folder…",
  teamLabel: "Team",
  teamPlaceholder: "e.g. content-team",
  teamSelectLabel: "Select team…",
  createFolderLabel: "Add folder",
  creatingFolderLabel: "Adding…",
  createTeamLabel: "Add team",
  creatingTeamLabel: "Adding…",
  bindingLabel: "Saving…",
  editAccessLabel: "Edit",
  publishAccessLabel: "Publish",
  accessOnLabel: "On",
  accessOffLabel: "Off",
  bindingsListTitle: "Current access",
  emptyBindingsMessage: "No rules yet — pick a folder and team below, then turn access on.",
  deleteFolderLabel: "Delete folder",
  deleteTeamLabel: "Delete team",
  deletingLabel: "Deleting…",
  deleteSuccessMessage: "Deleted.",
  deleteFolderConfirm:
    "Delete this folder? Documents in it will have no folder, and teams will lose access to it.",
  deleteTeamConfirm:
    "Delete this team? Members lose folder access granted through this team.",
  userLabel: "Add people",
  memberSearchPlaceholder: "Search by name or email…",
  noMemberMatchesMessage: "No matching people.",
  memberNoneSelectedLabel: "No one selected — pick from the list.",
  memberSelectedLabel: "selected",
  clearSelectionLabel: "Clear all",
  membersListTitle: "People on this team",
  emptyMembersMessage: "Nobody on this team yet — add someone below.",
  memberNameColumnHeader: "Person",
  orgRoleColumnHeader: "Org role",
  onTeamColumnHeader: "On team as",
  slotEditorLabel: "Add as editor",
  slotPublisherLabel: "Add as publisher",
  removeEditorLabel: "Remove editor",
  removePublisherLabel: "Remove publisher",
  grantOnePersonLabel: "Add 1 person to team",
  grantManyPeopleLabel: "Add {count} people to team",
  grantingLabel: "Saving…",
  revokeLabel: "Remove from team",
  revokingLabel: "Removing…",
  grantSuccessMessage: "Saved.",
  revokeSuccessMessage: "Removed.",
  foldersSectionTitle: "Folders",
  foldersSectionHint:
    "Group content by area (Marketing, Legal, …). Each page or layout belongs to one folder.",
  teamsSectionTitle: "Teams",
  teamsSectionHint: "Named groups of people who work on content together.",
  bindingsSectionTitle: "Folder access",
  bindingsSectionHint:
    "Connect a folder to a team or view agent folder access. Edit = draft in that folder. Publish = go live (teams only; agents never publish).",
  agentLabel: "Agent",
  agentBindingsListTitle: "Agent folder access",
  emptyAgentBindingsMessage: "No agents have folder access yet — grant access on Settings → Agents.",
  removeAgentBindingLabel: "Remove",
  membershipSectionTitle: "Team members",
  membershipSectionHint:
    "Pick a team, then add org members. Org role (from Settings → Users) must allow editing or publishing. Editor = draft on folders this team can access; publisher = can go live too.",
  emptyFoldersMessage: "No folders yet — create one above or pick a folder when editing content.",
  emptyTeamsMessage: "No teams yet — create one above.",
  helpText:
    "1. Create folders and teams. 2. Connect a folder to a team (edit and/or publish). 3. Add people to the team.",
  forbiddenLabel: "Content access requires store admin or access manager role.",
};

const adminScopeSpec = adminPanelSpec(["loadScope", "scopeAdmin"], {
  loadScope: {
    type: "MountAction",
    props: catalogProps({ action: "loadScopeAdmin" }, {}),
  },
  scopeAdmin: {
    type: "ScopeAdminForm",
    props: panelProps(
      {},
      "Content access",
      "Control who can edit team-scoped content.",
      scopeAdminLabels,
    ),
  },
});

const adminUsersSpec = adminPanelSpec(["loadTeam", "usersAdmin"], {
  loadTeam: {
    type: "MountAction",
    props: catalogProps({ action: "listTeamUsers" }, {}),
  },
  usersAdmin: {
    type: "UsersAdminForm",
    props: panelProps(
      {},
      "Team members",
      "Invite staff and assign roles. Store admin: any role. Access manager: any staff role except admin.",
      usersAdminLabels,
    ),
  },
});

const agentsAdminLabels = {
  loadingLabel: "Loading agents…",
  forbiddenLabel: "Agents require content draft access.",
  registrySectionTitle: "Registered agents",
  registrySectionDescription:
    "Create agents that draft on your behalf. Permissions are capped to what you hold.",
  slugLabel: "Slug",
  labelLabel: "Display name",
  registerLabel: "Register agent",
  registeringLabel: "Registering…",
  registerSuccessMessage: "Agent registered.",
  deleteLabel: "Delete",
  deleteConfirm: "Delete agent {slug}? This revokes all folder access.",
  deleteSuccessMessage: "Agent deleted.",
  mintTokenLabel: "Mint token",
  mintingLabel: "Minting…",
  mintSuccessMessage: "Copy this token now — it won't be shown again.",
  tokenExpiresLabel: "Expires",
  grantFolderLabel: "Grant folder editor access",
  grantFolderSuccessMessage: "Folder access granted.",
  folderSelectLabel: "Folder",
  emptyRegistryMessage: "No agents yet — register one above.",
  tasksSectionTitle: "Agent tasks",
  tasksSectionDescription: "Review completed agent work before it goes live.",
  emptyTasksMessage: "No agent tasks yet.",
  approveLabel: "Approve",
  rejectLabel: "Reject",
  taskApprovedMessage: "Task approved.",
  taskRejectedMessage: "Task rejected.",
  slugColumnHeader: "Slug",
  labelColumnHeader: "Name",
  ownerColumnHeader: "Owner",
  statusColumnHeader: "Status",
  typeColumnHeader: "Type",
  promptColumnHeader: "Prompt",
  reviewedByColumnHeader: "Reviewed by",
  tasksForbiddenLabel: "Task review requires store admin or ownership of the agent linked to the task.",
  createTaskSectionTitle: "Run orchestrate task",
  createTaskSectionDescription:
    "Example: “Summarize last week’s signups and draft a hero layout.” The agent runs analytics → layout/content drafts; you approve before publish.",
  taskPromptLabel: "Prompt",
  taskAgentLabel: "Agent",
  createTaskLabel: "Run task",
  creatingTaskLabel: "Starting…",
  createTaskSuccessMessage: "Task queued.",
  viewTaskLabel: "View",
  stepsSectionTitle: "Steps",
  artifactsSectionTitle: "Artifacts",
  runSummaryLabel: "Summary",
  noArtifactsMessage: "No drafts were created.",
  stepStatusOkLabel: "ok",
  stepStatusDeniedLabel: "denied",
  stepStatusErrorLabel: "error",
  runningTaskLabel: "Task is running — refreshing every few seconds…",
};

const adminAgentsSpec = adminPanelSpec(["loadAgents", "agentsAdmin"], {
  loadAgents: {
    type: "MountAction",
    props: catalogProps({ action: "loadAgentsAdmin" }, {}),
  },
  agentsAdmin: {
    type: "AgentsAdminForm",
    props: panelProps(
      {},
      "Agents",
      "Register agents, mint scoped tokens, and approve completed tasks.",
      agentsAdminLabels,
    ),
  },
});

const adminLoginBrandingSpec = adminPanelSpec(["loginBranding"], {
  loginBranding: {
    type: "LoginBrandingForm",
    props: panelProps(
      { segment: "default" },
      "Login appearance",
      "Edit title, logo, and brand copy on /login. Publish to update the live login page.",
      loginBrandingLabels,
    ),
  },
});

const adminAccountSecuritySpec = adminPanelSpec(["loadSession", "securityAdmin"], {
  loadSession: {
    type: "MountAction",
    props: catalogProps({ action: "loadAccountSecuritySession" }, {}),
  },
  securityAdmin: {
    type: "AccountSecurityForm",
    props: panelProps(
      { variant: "admin" },
      accountSecurityLabels.title,
      accountSecurityLabels.description,
      accountSecurityLabels,
    ),
  },
});

const accountSecuritySpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: catalogProps(
        { layout: "centered" },
        { brandTitle: "Account security", brandSubtitle: "Protect your account" },
      ),
      children: ["loadSession", "security"],
    },
    loadSession: {
      type: "MountAction",
      props: catalogProps({ action: "loadAccountSecuritySession" }, {}),
    },
    security: {
      type: "AccountSecurityForm",
      props: panelProps(
        { variant: "standalone" },
        accountSecurityLabels.title,
        accountSecurityLabels.description,
        accountSecurityLabels,
      ),
    },
  },
};

const accountCommunicationPrefsLabels = {
  title: "Communication preferences",
  description: "Choose how this store may contact you.",
  signInRequiredDescription: "Sign in to manage your notification preferences.",
  signInLinkLabel: "Sign in",
  loadingLabel: "Loading preferences…",
  saveLabel: "Save preferences",
  savingLabel: "Saving…",
  successMessage: "Preferences saved.",
  inboxLinkLabel: "View notification inbox →",
  channelsSectionTitle: "Channels",
  categoriesSectionTitle: "Message types",
  transactionalNote: "Order confirmations and security alerts are always delivered.",
  channels: {
    email: {
      label: "Email",
      helper: "Non-transactional email for this store.",
    },
    sms: {
      label: "SMS",
      helper: "Text messages when the store enables SMS on a notification.",
    },
    in_app: {
      label: "In-app inbox",
      helper: "Notifications in your account inbox.",
    },
  },
  categories: {
    marketing: {
      label: "Marketing",
      helper: "Promotions and newsletters. Off by default.",
    },
    operational: {
      label: "Operational updates",
      helper: "Agent tasks, account alerts, and store operational messages.",
    },
  },
};

const accountCommunicationPrefsSpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: catalogProps(
        { layout: "centered" },
        { brandTitle: "Preferences", brandSubtitle: "How we contact you" },
      ),
      children: ["loadPrefs", "prefs"],
    },
    loadPrefs: {
      type: "MountAction",
      props: catalogProps({ action: "loadNotificationPreferences" }, {}),
    },
    prefs: {
      type: "AccountNotificationPrefsForm",
      props: catalogProps({}, accountCommunicationPrefsLabels),
    },
  },
};

const accountNotificationsSpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: catalogProps(
        { layout: "centered" },
        { brandTitle: "Notifications", brandSubtitle: "Your account messages" },
      ),
      children: ["loadInbox", "inbox"],
    },
    loadInbox: {
      type: "MountAction",
      props: catalogProps({ action: "loadAccountInbox" }, {}),
    },
    inbox: {
      type: "AccountNotificationsInbox",
      props: catalogProps({}, accountNotificationsLabels),
    },
  },
};

const adminContentSpec = adminPanelSpec(["contentAdmin"], {
  contentAdmin: {
    type: "ContentEntryAdmin",
    props: panelProps(
      { locale: "en-US" },
      "Content entries",
      "Pick a content type, edit entries, and publish. Fields come from the content type schema in documents.",
      contentAdminLabels,
    ),
  },
});

const adminLayoutSpec = adminPanelSpec(["layoutAdmin"], {
  layoutAdmin: {
    type: "LayoutEntryAdmin",
    props: panelProps(
      { segment: "default" },
      "Layout templates",
      "Edit json-render specs for home, login, and other templates. Publish to update the live site.",
      layoutAdminLabels,
    ),
  },
});

const adminHomeSpec = adminPanelSpec(["home"], {
  home: {
    type: "AdminHome",
    props: catalogProps(
      { links: adminHomeLinkConfig },
      {
        title: "Dashboard",
        description: "Manage content, layouts, and auth without re-seeding.",
        links: adminHomeLinkLabels,
      },
    ),
  },
});

const adminPagesSpec = adminPanelSpec(["loadPages", "pagesAdmin"], {
  loadPages: {
    type: "MountAction",
    props: catalogProps({ action: "listRoutingPages" }, {}),
  },
  pagesAdmin: {
    type: "PageEntryAdmin",
    props: panelProps(
      {},
      "Pages",
      "Routing page documents (layout + contentRef). Use URL tree for storefront path mappings.",
      pageEntryAdminLabels,
    ),
  },
});

const adminPagesTreeSpec = adminPanelSpec(["treeAdmin"], {
  treeAdmin: {
    type: "PageTreeAdmin",
    props: panelProps(
      { locale: "en-US" },
      "URL tree",
      "Maps storefront paths to page document keys.",
      pageTreeAdminLabels,
    ),
  },
});

const pageContentType = {
  fields: [
    { key: "title", type: "text", required: true, isLocalizable: true, label: "Title" },
    { key: "body", type: "longText", required: false, isLocalizable: true, label: "Body" },
  ],
};

const editorPrefsContentType = {
  fields: [
    { key: "userId", type: "text", required: true, isLocalizable: false, label: "User ID" },
    {
      key: "palettePins",
      type: "json",
      required: false,
      isLocalizable: false,
      label: "Pinned palette component types",
    },
    {
      key: "layout",
      type: "json",
      required: false,
      isLocalizable: false,
      label: "Editor panel layout (widths, open state)",
    },
    {
      key: "layersTreeCollapsed",
      type: "json",
      required: false,
      isLocalizable: false,
      label: "Collapsed layer-tree branches per template",
    },
  ],
};

const notificationEmailContentType = {
  fields: [
    { key: "template_key", type: "text", required: true, isLocalizable: false, label: "Template key" },
    { key: "subject", type: "text", required: true, isLocalizable: false, label: "Email subject" },
    {
      key: "spec",
      type: "json",
      required: true,
      isLocalizable: false,
      label: "Email layout (json-render spec)",
    },
    {
      key: "category",
      type: "enum",
      required: false,
      isLocalizable: false,
      label: "Preference category",
      options: ["transactional", "operational", "marketing"],
    },
  ],
};

const authProviderContentType = {
  fields: [
    { key: "name", type: "text", required: true, isLocalizable: false, label: "Display name" },
    {
      key: "provider_key",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "Provider key (google, github, apple, or custom slug)",
    },
    {
      key: "enabled",
      type: "boolean",
      required: false,
      isLocalizable: false,
      label: "Show on login when credentials are configured",
    },
    {
      key: "icon",
      type: "media",
      required: false,
      isLocalizable: false,
      label: "Login button icon",
    },
    {
      key: "client_id",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Client ID (custom OAuth only)",
    },
    {
      key: "client_secret",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Client secret (custom OAuth only)",
    },
    {
      key: "authorization_endpoint",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Authorization endpoint (custom OAuth only)",
    },
    {
      key: "token_endpoint",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Token endpoint (custom OAuth only)",
    },
    {
      key: "user_endpoint",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "User info endpoint (custom OAuth only)",
    },
    {
      key: "scopes",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Scopes (comma-separated, custom OAuth only)",
    },
  ],
};

let seedAdminToken: string | null = null;

function orgHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-org-id": demoOrgId,
  };
  if (seedAdminToken) {
    headers.Authorization = `Bearer ${seedAdminToken}`;
  }
  return headers;
}

async function ensureDemoAdminRole(): Promise<void> {
  const projectId = process.env.ZITADEL_PROJECT_ID?.trim();
  if (!projectId) {
    console.warn("ZITADEL_PROJECT_ID not set — skip admin role grant (run pnpm init:zitadel)");
    return;
  }

  const adminEmail = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";

  const userId = await findUserIdByEmail(demoOrgId, adminEmail);
  if (!userId) {
    console.warn(`Demo admin user ${adminEmail} not found in org — skip role grant`);
    return;
  }

  await upsertUserTeamRole(demoOrgId, projectId, userId, "admin");
  console.log(`Granted ZITADEL admin role to ${adminEmail}`);
}

async function obtainSeedAdminToken(): Promise<void> {
  const clientId = process.env.ZITADEL_CLIENT_ID?.trim();
  if (!clientId) {
    console.warn("ZITADEL_CLIENT_ID not set — seed mutations need admin JWT (run pnpm init:zitadel)");
    return;
  }

  const email = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const password = process.env.ZITADEL_DEMO_ADMIN_PASSWORD?.trim() ?? "NonameAdmin1!";
  const redirectUri = process.env.ZITADEL_REDIRECT_URI?.trim() ?? "http://localhost:5173/auth/callback";

  try {
    const result = await loginWithCredentials({
      orgId: demoOrgId,
      email,
      password,
      clientId,
      redirectUri,
      codeVerifier: randomBytes(32).toString("base64url"),
    });
    if (result.status !== "success") {
      console.warn("Seed admin login requires MFA — complete MFA manually or disable for seed user");
      return;
    }
    seedAdminToken = result.accessToken;
    console.log(`Seed admin JWT obtained for ${email}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Could not obtain seed admin JWT: ${message}`);
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: orgHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface LayoutRow {
  id: string;
  key: string;
  status: string;
}

async function upsertLayout(
  templateName: string,
  spec: Record<string, unknown>,
  options?: {
    skipIfExists?: boolean;
    renderAs?: "standalone" | "shell" | "panel" | "editor";
    shellRef?: string;
  },
): Promise<void> {
  const meta: Record<string, unknown> = {};
  if (options?.renderAs) {
    meta.renderAs = options.renderAs;
  }
  if (options?.shellRef) {
    meta.shellRef = options.shellRef;
  }

  const { data: layouts } = await api<{ data: LayoutRow[] }>(
    "GET",
    `/api/documents/layout?segment=default&templateName=${templateName}`,
  );
  const existing = layouts.find((row) => row.key === templateName);

  if (existing) {
    if (options?.skipIfExists) {
      console.log(`${templateName} layout already published — skipping create.`);
      return;
    }
    await api("PUT", `/api/documents/layout/${existing.id}`, { spec, ...meta });
    if (existing.status !== "published") {
      await api("PUT", `/api/documents/layout/${existing.id}/publish`);
    }
    console.log(`${templateName} layout updated.`);
    return;
  }

  const { data: created } = await api<{ data: { id: string } }>("POST", "/api/documents/layout", {
    templateName,
    segment: "default",
    spec,
    ...meta,
  });
  await api("PUT", `/api/documents/layout/${created.id}/publish`);
  console.log(`${templateName} layout created and published.`);
}

async function ensureDemoFlag(): Promise<void> {
  const { data: flags } = await api<{ data: Array<{ key: string }> }>("GET", "/api/flags");
  if (flags.some((f) => f.key === "show_summer_sale")) {
    console.log("show_summer_sale flag already exists — skipping create.");
    return;
  }
  await api("POST", "/api/flags", {
    key: "show_summer_sale",
    type: "boolean",
    description: "Show summer sale banner on storefront home",
    defaultValue: true,
  });
  console.log("show_summer_sale flag created.");
}

async function syncKetoOrgEditorAccess(): Promise<void> {
  if (!seedAdminToken) return;
  const adminSub = subFromAccessToken(seedAdminToken);
  if (!adminSub) return;

  try {
    await seedOrgEditorAccess({
      orgId: demoOrgId,
      editorSubs: [adminSub],
      orgHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Keto org editor seed failed: ${message}`);
    console.warn("Start Keto: podman compose up -d keto");
  }
}

async function main() {
  reloadSeedEnv();
  demoOrgId = process.env.ZITADEL_DEMO_ORG_ID?.trim() ?? "";

  if (!demoOrgId) {
    throw new Error("ZITADEL_DEMO_ORG_ID is empty — run: pnpm init:zitadel");
  }

  console.log(`Seeding demo org ${demoOrgId} via ${API_BASE} ...`);

  let health: Response;
  try {
    health = await fetch(`${API_BASE}/health`);
  } catch {
    throw new Error(`API server not reachable at ${API_BASE} — start with: pnpm dev`);
  }
  if (!health.ok) {
    throw new Error(`API server not healthy at ${API_BASE} — start with: pnpm dev`);
  }

  await ensureDemoAdminRole();
  await obtainSeedAdminToken();

  await ensureDemoFlag();

  await api("PUT", "/api/documents/tenant_settings/default", {
    slug: "yogastore",
    locales: ["en-US"],
    defaultLocale: "en-US",
  });

  const googleIdpId = process.env.ZITADEL_GOOGLE_IDP_ID?.trim();

  await api("PUT", `/api/tenants/${DEMO_STORE_SLUG}/catalog`, {
    platform: { version: "1", hash: "demo" },
    extensions: [],
  });

  await upsertLayout("admin_shell", adminShellSpec, { renderAs: "shell" });
  await upsertLayout("visual_editor", visualEditorShellSpec, { renderAs: "shell" });
  await upsertLayout("home", demoSpec, { renderAs: "standalone" });
  await upsertLayout("login", loginSpec, { renderAs: "standalone" });
  await upsertLayout("admin_dashboard", adminDashboardSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_integrations", adminIntegrationsSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_flags", adminFlagsSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_replay", adminReplaySpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_analytics", adminAnalyticsSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_users", adminUsersSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_scope", adminScopeSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_agents", adminAgentsSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_login", adminLoginBrandingSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_content", adminContentSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_layout", adminLayoutSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_home", adminHomeSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_pages", adminPagesSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_pages_tree", adminPagesTreeSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_account_security", adminAccountSecuritySpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("account_security", accountSecuritySpec, { renderAs: "standalone" });
  await upsertLayout("account_notifications", accountNotificationsSpec, { renderAs: "standalone" });
  await upsertLayout("account_communication_preferences", accountCommunicationPrefsSpec, {
    renderAs: "standalone",
  });

  await ensurePageContentType();
  await ensureEditorPrefsContentType();
  await ensureNotificationEmailContentType();
  await ensureAuthProviderContentType();
  await ensureBuiltinAuthProviders({ googleEnabled: Boolean(googleIdpId) });
  await ensureNotificationEmailTemplates();
  if (googleIdpId) {
    await api("PUT", "/api/documents/tenant_settings/default", {
      auth: {
        idpIds: { google: googleIdpId },
        allowPassword: true,
      },
    });
    console.log("Auth config: Google IdP id stored in tenant_settings for demo org.");
  }
  const pageContentId = await ensureDemoPageEntry();
  await ensurePageRouting(pageContentId);

  const { data: schema } = await api<{ data: { layout: unknown } }>(
    "GET",
    `/api/edge/schema/${DEMO_STORE_SLUG}?url=${encodeURIComponent("/")}`,
  );

  if (!schema.layout) {
    throw new Error("Seed succeeded but edge schema returned no layout");
  }

  await syncKetoOrgEditorAccess();

  if (seedAdminToken) {
    const adminSub = subFromAccessToken(seedAdminToken);
    if (adminSub) {
      try {
        await seedDemoTeamAndScope({
          orgId: demoOrgId,
          adminSub,
          storeSlug: DEMO_STORE_SLUG,
          orgHeaders,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Demo team scope seed failed: ${message}`);
      }
    }
  }

  console.log("Demo seed complete.");
  console.log(`  Org:     ${demoOrgId}`);
  console.log(`  Slug:    yogastore`);
  console.log(`  Layout:  home + login + admin_home + admin_content + admin_layout + admin_pages + admin_pages_tree + admin_dashboard + admin_analytics + admin_replay`);
  console.log(`  Client:  http://yogastore.localhost:5173`);
  console.log(`  Login:   http://yogastore.localhost:5173/login`);
  console.log(`  Admin:   http://yogastore.localhost:5173/admin`);
  console.log(`  Content: http://yogastore.localhost:5173/admin/content`);
  console.log(`  IdPs:    http://yogastore.localhost:5173/admin/content/auth_provider`);
  console.log(`  Pages:   http://yogastore.localhost:5173/admin/pages`);
  console.log(`  Layouts: http://yogastore.localhost:5173/admin/layout`);
  console.log(`  Auth:    http://yogastore.localhost:5173/admin/settings/auth`);
  console.log(`  Access:  http://yogastore.localhost:5173/admin/settings/scope`);
  console.log(`  Team:    http://yogastore.localhost:5173/admin/users`);
}

async function ensureNotificationEmailContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  const existing = types.find((t) => t.name === "notification_email");

  if (existing) {
    const { data: typeDef } = await api<{ data: { schema: typeof notificationEmailContentType } }>(
      "GET",
      "/api/documents/content-types/notification_email",
    );
    const fieldKeys = new Set(typeDef.schema.fields.map((field) => field.key));
    const needsSync = !fieldKeys.has("spec") || fieldKeys.has("html_body");
    if (needsSync) {
      await api("PUT", "/api/documents/content-types/notification_email", {
        schema: notificationEmailContentType,
      });
      console.log("notification_email content type schema synced (json-render spec).");
    } else {
      console.log("notification_email content type already exists.");
    }
    return;
  }

  await api("POST", "/api/documents/content-types", {
    name: "notification_email",
    schema: notificationEmailContentType,
  });
  console.log("notification_email content type created.");
}

async function ensureNotificationEmailTemplates(): Promise<void> {
  const templates = [
    {
      template_key: "agent-task-complete",
      subject: "Agent task complete",
      spec: agentTaskCompleteEmailSpec,
      category: "operational",
    },
    {
      template_key: "welcome",
      subject: "Welcome",
      spec: welcomeEmailSpec,
      category: "transactional",
    },
  ] as const;

  const { data: existing } = await api<{ data: ContentEntryRow[] }>(
    "GET",
    "/api/documents/notification_email",
  );

  for (const template of templates) {
    const row = existing.find(
      (entry) =>
        String(entry.data.template_key ?? "")
          .trim()
          .toLowerCase() === template.template_key,
    );

    if (row) {
      await api("PUT", `/api/documents/notification_email/${row.id}`, template);
      if (row.status !== "published") {
        await api("PUT", `/api/documents/notification_email/${row.id}/publish`);
      }
      console.log(`notification_email/${template.template_key} updated.`);
      continue;
    }

    const { data: created } = await api<{ data: { id: string } }>(
      "POST",
      "/api/documents/notification_email",
      template,
    );
    await api("PUT", `/api/documents/notification_email/${created.id}/publish`);
    console.log(`notification_email/${template.template_key} created and published.`);
  }
}

async function ensureAuthProviderContentType(): Promise<void> {
  const iconField = authProviderContentType.fields.find((f) => f.key === "icon");
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  const existing = types.find((t) => t.name === "auth_provider");

  if (existing) {
    const { data: typeDef } = await api<{ data: { schema: typeof authProviderContentType } }>(
      "GET",
      "/api/documents/content-types/auth_provider",
    );
    const hasIcon = typeDef.schema.fields.some((f) => f.key === "icon");
    const oauthOptional = ["client_id", "client_secret", "authorization_endpoint", "token_endpoint", "user_endpoint"].every(
      (key) => {
        const field = typeDef.schema.fields.find((f) => f.key === key);
        return !field || field.required === false;
      },
    );
    if ((!hasIcon && iconField) || !oauthOptional) {
      await api("PUT", "/api/documents/content-types/auth_provider", {
        schema: authProviderContentType,
      });
      console.log("auth_provider content type schema synced.");
    } else {
      console.log("auth_provider content type already exists.");
    }
    return;
  }

  await api("POST", "/api/documents/content-types", {
    name: "auth_provider",
    schema: authProviderContentType,
  });
  console.log("auth_provider content type created.");
}

interface UploadedAssetRow {
  id: string;
  key: string;
}

async function uploadIdpIcon(fileName: string): Promise<UploadedAssetRow> {
  const filePath = join(scriptDir, "assets", "idp", fileName);
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/svg+xml" }), fileName);

  const headers: Record<string, string> = { "x-org-id": demoOrgId };
  if (seedAdminToken) {
    headers.Authorization = `Bearer ${seedAdminToken}`;
  }

  const res = await fetch(`${API_BASE}/api/documents/assets/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload ${fileName} → ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { data: UploadedAssetRow };
  return body.data;
}

async function ensureBuiltinAuthProviders(options: {
  googleEnabled: boolean;
}): Promise<void> {
  const builtins = [
    { key: "google", name: "Google", file: "google.svg", enabled: options.googleEnabled },
    { key: "github", name: "GitHub", file: "github.svg", enabled: false },
    { key: "apple", name: "Apple", file: "apple.svg", enabled: false },
  ] as const;

  const { data: existing } = await api<{ data: ContentEntryRow[] }>(
    "GET",
    "/api/documents/auth_provider",
  );

  for (const builtin of builtins) {
    const icon = await uploadIdpIcon(builtin.file);
    const payload = {
      name: builtin.name,
      provider_key: builtin.key,
      enabled: builtin.enabled,
      icon: icon.id ? { documentId: icon.id } : undefined,
    };

    const row = existing.find(
      (entry) => String(entry.data.provider_key ?? "").toLowerCase() === builtin.key,
    );

    if (row) {
      await api("PUT", `/api/documents/auth_provider/${row.id}`, payload);
      if (row.status !== "published") {
        await api("PUT", `/api/documents/auth_provider/${row.id}/publish`);
      }
      console.log(`auth_provider/${builtin.key} updated.`);
      continue;
    }

    const { data: created } = await api<{ data: { id: string } }>(
      "POST",
      "/api/documents/auth_provider",
      payload,
    );
    await api("PUT", `/api/documents/auth_provider/${created.id}/publish`);
    console.log(`auth_provider/${builtin.key} created and published.`);
  }
}

interface ContentEntryRow {
  id: string;
  status: string;
  data: Record<string, unknown>;
}

async function ensureEditorPrefsContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  const existing = types.find((t) => t.name === "editor_prefs");

  if (existing) {
    const { data: typeDef } = await api<{ data: { schema: typeof editorPrefsContentType } }>(
      "GET",
      "/api/documents/content-types/editor_prefs",
    );
    const fieldKeys = new Set(typeDef.schema.fields.map((field) => field.key));
    const needsSync = !fieldKeys.has("layout") || !fieldKeys.has("layersTreeCollapsed");
    if (needsSync) {
      await api("PUT", "/api/documents/content-types/editor_prefs", {
        schema: editorPrefsContentType,
      });
      console.log("editor_prefs content type schema synced.");
    } else {
      console.log("editor_prefs content type already exists.");
    }
    return;
  }

  await api("POST", "/api/documents/content-types", {
    name: "editor_prefs",
    schema: editorPrefsContentType,
  });
  console.log("editor_prefs content type created.");
}

async function ensurePageContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  if (types.some((t) => t.name === "page")) {
    console.log("Page content type already exists.");
    return;
  }
  await api("POST", "/api/documents/content-types", { name: "page", schema: pageContentType });
  console.log("Page content type created.");
}

async function ensureDemoPageEntry(): Promise<string> {
  const { data: existing } = await api<{ data: { id: string; status: string }[] }>(
    "GET",
    "/api/documents/page",
  );
  const published = existing.find((row) => row.status === "published");
  if (published) {
    console.log("Demo page entry already published.");
    return published.id;
  }

  const { data: created } = await api<{ data: { id: string } }>(
    "POST",
    "/api/documents/page?locale=en-US",
    {
      title: "Welcome",
      body: "Edit this page in Admin → Content.",
    },
  );
  await api("PUT", `/api/documents/page/${created.id}/publish`);
  console.log(`Demo page entry published (${created.id}).`);
  return created.id;
}

async function ensurePageRouting(pageContentId: string): Promise<void> {
  await api("PUT", "/api/documents/page/home", {
    layoutRef: "home",
    contentRef: `page:${pageContentId}`,
  });
  await api("PUT", "/api/documents/page_tree/main", {
    pages: [
      {
        id: "home",
        slug: { "en-US": "/" },
        pageId: "home",
      },
    ],
  });
  console.log("Page routing seeded (page_tree → home → page content).");
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
