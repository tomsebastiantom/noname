import { DEFAULT_LOGIN_FORM_MESSAGES } from "../../packages/client/src/core/login-form-labels";
import {
  accountCommunicationPrefsLabels,
  accountNotificationsLabels,
  accountSecurityLabels,
  adminHomeLinkConfig,
  adminHomeLinkLabels,
  adminShellNavConfig,
  adminShellNavLabels,
  agentsAdminLabels,
  analyticsEventsAdminLabels,
  authSettingsLabels,
  contentAdminLabels,
  featureFlagsAdminLabels,
  integrationsCommsDeliveriesLabels,
  integrationsCommsInboxLabels,
  integrationsCommsLabels,
  integrationsLlmLabels,
  integrationsOAuthLabels,
  integrationsWebhooksLabels,
  layoutAdminLabels,
  loginBrandingLabels,
  loginViewLabels,
  pageEntryAdminLabels,
  pageTreeAdminLabels,
  scopeAdminLabels,
  sessionReplayAdminLabels,
  tracesAdminLabels,
  usersAdminLabels,
} from "./demo-labels";

function catalogProps<TConfig extends Record<string, unknown>, TLabels extends Record<string, unknown>>(
  config: TConfig,
  labels: TLabels,
) {
  return { config, labels };
}

export const loginSpec = {
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

export const demoSpec = {
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

export const adminShellSpec = {
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
export const visualEditorShellSpec = {
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
          lastEditTemplate: "{actor} edited {timeAgo}",
          lastPublishTemplate: "{actor} published {timeAgo}",
          lastEditYouLabel: "You",
          lastEditAgentLabel: "Agent",
          lastEditSomeoneLabel: "Someone",
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
          runAgentLabel: "Run agent",
          runAgentDisabledHint: "Save or load a layout draft before running an agent.",
          runAgentDialogTitle: "Run agent on this page",
          runAgentDialogBody:
            "The agent joins live collab on this layout while it works. Review drafts before publish.",
          runAgentSelectLabel: "Agent",
          runAgentSelectPlaceholder: "Choose an agent…",
          runAgentPromptLabel: "Prompt",
          runAgentPromptPlaceholder: "Ask the agent to change something on this page…",
          runAgentSubmitLabel: "Start task",
          runAgentSubmittingLabel: "Starting…",
          runAgentStartedLabel: "Agent task started",
          agentPanelTitle: "Assistant",
          openAgentPanelLabel: "Assistant",
          agentContextLabel: "Focused on",
          agentFailureDetailsLabel: "What happened",
          agentClearChatLabel: "Clear chat",
          agentClearChatDisabledHint: "Wait until your message finishes sending",
          agentReviewDraftsHint:
            "Draft changes were made on the canvas. Approve to keep them or reject to discard this run.",
          agentLiveUndoHint:
            "This change is already live on the canvas. Undo restores the previous version.",
          agentUndoLabel: "Undo",
          agentContinueHint: "Reply below — each message starts a new agent turn.",
          agentStatusReplyLabel: "Reply",
          agentEmptyHint:
            "Ask a question or describe a change. Follow up in the box below — no Approve button needed until the agent edits drafts.",
          agentRunningLabel: "Running…",
          agentActivityTitle: "Activity",
          agentActivityExpandLabel: "Show steps",
          agentActivityCollapseLabel: "Hide steps",
          agentSummaryLabel: "Summary",
          agentStepsLabel: "Steps",
          agentArtifactsLabel: "Artifacts",
          agentApproveLabel: "Approve",
          agentRejectLabel: "Reject",
          agentPeerBadgeLabel: "agent",
          agentConsoleTitle: "Console",
          agentConsoleQueuedLabel: "Task queued…",
          agentConsoleStartingLabel: "Starting orchestration…",
          agentConsoleCollabLabel: "Joining live collab on this layout…",
          agentConsoleReadingLabel: "Reading page and layout context…",
          agentConsolePlanningLabel: "Planning changes…",
          agentConsoleToolsLabel: "Running tools…",
          agentConsoleThinkingLabel: "Thinking…",
          agentConsoleWorkingLabel: "Working…",
          agentStatusPendingLabel: "Queued",
          agentStatusRunningLabel: "Working",
          agentStatusDoneLabel: "Done",
          agentStatusFailedLabel: "Failed",
          agentRetryLabel: "Try again",
          agentWhatIDidLabel: "What I did",
          collabLiveLabel: "Live",
          collabSelfLabel: "You",
          collabPeopleCountTemplate: "People ({count})",
          collabAgentsCountTemplate: "Agents ({count})",
          collabEditingAloneLabel: "Editing alone",
          collabHumanFallbackLabel: "Collaborator",
          collabAgentFallbackLabel: "Agent",
          collabExpandGroupLabel: "Show everyone",
          collabCollapseGroupLabel: "Hide list",
          collabConnectedTitle: "Connected",
          collabReconnectingTitle: "Reconnecting",
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

export const adminDashboardSpec = adminPanelSpec(["authSettings"], {
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

export const adminIntegrationsSpec = adminPanelSpec(
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

export const adminFlagsSpec = adminPanelSpec(["loadFlags", "flagsAdmin"], {
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

export const adminReplaySpec = adminPanelSpec(["loadReplay", "replayAdmin"], {
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

export const adminTracesSpec = adminPanelSpec(["loadTraces", "tracesAdmin"], {
  loadTraces: {
    type: "MountAction",
    props: catalogProps({ action: "loadTracesAdmin" }, {}),
  },
  tracesAdmin: {
    type: "TracesAdmin",
    props: panelProps(
      {},
      "Traces",
      "Distributed traces captured from instrumented server requests.",
      tracesAdminLabels,
    ),
  },
});

export const adminAnalyticsSpec = adminPanelSpec(["loadAnalytics", "analyticsAdmin"], {
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

export const adminScopeSpec = adminPanelSpec(["loadScope", "scopeAdmin"], {
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

export const adminUsersSpec = adminPanelSpec(["loadTeam", "usersAdmin"], {
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

export const adminAgentsSpec = adminPanelSpec(["loadAgents", "agentsAdmin"], {
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

export const adminLoginBrandingSpec = adminPanelSpec(["loginBranding"], {
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

export const adminAccountSecuritySpec = adminPanelSpec(["loadSession", "securityAdmin"], {
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

export const accountSecuritySpec = {
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

export const accountCommunicationPrefsSpec = {
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

export const accountNotificationsSpec = {
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

export const adminContentSpec = adminPanelSpec(["contentAdmin"], {
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

export const adminLayoutSpec = adminPanelSpec(["layoutAdmin"], {
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

export const adminHomeSpec = adminPanelSpec(["home"], {
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

export const adminPagesSpec = adminPanelSpec(["loadPages", "pagesAdmin"], {
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

export const adminPagesTreeSpec = adminPanelSpec(["treeAdmin"], {
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
