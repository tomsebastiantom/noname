import { z } from "zod";

export const adminActionSchemas = {
  loadAuthSettings: {
    description: "Load auth configuration and provider state for admin settings",
  },
  loadContentAdmin: {
    params: z
      .object({
        contentType: z.string().optional(),
        locale: z.string().optional(),
      })
      .optional(),
    description: "Load content types list or entries for one content type",
  },
  loadLayoutAdmin: {
    params: z
      .object({
        templateName: z.string().optional(),
        segment: z.string().optional(),
      })
      .optional(),
    description: "Load layout templates list or one layout template editor",
  },
  loadLoginBranding: {
    params: z
      .object({
        segment: z.string().optional(),
      })
      .optional(),
    description: "Load login layout branding fields for admin editor",
  },
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
  loadMediaAssets: {
    description: "Load asset library for media field picker",
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
  loadAnalyticsAdmin: {
    description: "Load recent analytics events and event-type aggregations",
  },
  loadTracesAdmin: {
    description: "Load recent distributed traces for this org",
  },
  loadTraceDetail: {
    params: z.object({
      traceId: z.string().min(1),
    }),
    description: "Load span waterfall for one trace",
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
