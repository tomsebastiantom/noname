/** json-render $state paths for admin panels (load actions write, components read). */
export const ADMIN_STATE = {
  team: {
    users: "/admin/team/users",
    loading: "/admin/team/loading",
    error: "/admin/team/error",
  },
  routing: {
    pages: "/admin/routing/pages",
    currentPage: "/admin/routing/currentPage",
    loading: "/admin/routing/loading",
    error: "/admin/routing/error",
    treePages: "/admin/routing/tree/pages",
    treeStatus: "/admin/routing/tree/status",
    treeLoadedAt: "/admin/routing/tree/loadedAt",
    treeLoading: "/admin/routing/tree/loading",
    treeError: "/admin/routing/tree/error",
  },
  replay: {
    sessions: "/admin/replay/sessions",
    loading: "/admin/replay/loading",
    error: "/admin/replay/error",
    selectedSessionId: "/admin/replay/selectedSessionId",
    chunkPreview: "/admin/replay/chunkPreview",
    chunkLoading: "/admin/replay/chunkLoading",
    playerEvents: "/admin/replay/playerEvents",
    playerLoading: "/admin/replay/playerLoading",
  },
  flags: {
    flags: "/admin/flags/rows",
    loading: "/admin/flags/loading",
    error: "/admin/flags/error",
  },
  content: {
    loaded: "/admin/content/loaded",
    loading: "/admin/content/loading",
    error: "/admin/content/error",
    mediaAssets: "/admin/content/mediaAssets",
    mediaAssetsLoading: "/admin/content/mediaAssetsLoading",
  },
  layout: {
    loaded: "/admin/layout/loaded",
    loading: "/admin/layout/loading",
    error: "/admin/layout/error",
  },
  scope: {
    tags: "/admin/scope/tags",
    teams: "/admin/scope/teams",
    loading: "/admin/scope/loading",
    error: "/admin/scope/error",
  },
  analytics: {
    events: "/admin/analytics/events",
    aggregations: "/admin/analytics/aggregations",
    loading: "/admin/analytics/loading",
    error: "/admin/analytics/error",
  },
  authSettings: {
    loaded: "/admin/auth/settings/loaded",
    loading: "/admin/auth/settings/loading",
    error: "/admin/auth/settings/error",
  },
  loginBranding: {
    loaded: "/admin/auth/login-branding/loaded",
    loading: "/admin/auth/login-branding/loading",
    error: "/admin/auth/login-branding/error",
  },
} as const;
