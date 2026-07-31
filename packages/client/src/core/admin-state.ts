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
} as const;
