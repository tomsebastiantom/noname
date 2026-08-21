export const pageContentType = {
  fields: [
    { key: "title", type: "text", required: true, isLocalizable: true, label: "Title" },
    { key: "body", type: "longText", required: false, isLocalizable: true, label: "Body" },
  ],
};

export const editorPrefsContentType = {
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
    {
      key: "agentChatClearedAt",
      type: "json",
      required: false,
      isLocalizable: false,
      label: "Agent chat cleared timestamps per layout",
    },
  ],
};

export const notificationEmailContentType = {
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

export const authProviderContentType = {
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
