import { COMMS_PROVIDERS } from "@noname/shared";
import { z } from "zod";

export const adminActionSchemas = {
  loadSchedules: {
    description: "Load schedules and the definitions available to create one from",
  },
  createSchedule: {
    params: z.object({ definition: z.string().min(1), pattern: z.string().min(1), label: z.string().optional() }),
    description: "Create a schedule for an existing definition",
  },
  runSchedule: {
    params: z.object({ id: z.string().uuid() }),
    description: "Run a schedule now",
  },
  pauseSchedule: {
    params: z.object({ id: z.string().uuid(), paused: z.boolean() }),
    description: "Pause or resume a schedule",
  },
  setSchedulePattern: {
    params: z.object({ id: z.string().uuid(), pattern: z.string().min(1) }),
    description: "Change when a schedule runs",
  },
  setScheduleDryRun: {
    params: z.object({ id: z.string().uuid(), dryRun: z.boolean() }),
    description: "Turn the dry run of a schedule on or off",
  },
  deleteSchedule: {
    params: z.object({ id: z.string().uuid() }),
    description: "Remove a schedule; its run history is kept",
  },
  loadPlatformTenants: {
    description: "Load every tenant with its provisioning and verdict state",
  },
  createPlatformTenant: {
    params: z.object({ slug: z.string().min(1) }),
    description: "Provision a new tenant from a slug",
  },
  backfillPlatformTenants: {
    description: "Give pre-existing tenants a provisioning record",
  },
  invitePlatformTenant: {
    params: z.object({ orgId: z.string().min(1), email: z.string().email() }),
    description: "Invite a tenant's first human admin",
  },
  ackPlatformTenant: {
    params: z.object({ orgId: z.string().min(1), reason: z.string().min(3) }),
    description: "Acknowledge an unverified verdict without promoting it",
  },
  promotePlatformTenant: {
    params: z.object({ orgId: z.string().min(1), releaseId: z.string().min(1) }),
    description: "Promote one tenant through the wave path",
  },
  deletePlatformTenant: {
    params: z.object({ orgId: z.string().min(1) }),
    description: "Soft-delete a tenant: hidden from the console, rows retained",
  },
  purgePlatformTenant: {
    params: z.object({ orgId: z.string().min(1) }),
    description: "Permanently remove a soft-deleted tenant's rows and IdP org",
  },
  rollbackPlatformTenant: {
    params: z.object({ orgId: z.string().min(1) }),
    description: "Roll a tenant back to its previous release",
  },
  loadPlatformTenantHistory: {
    params: z.object({ orgId: z.string().min(1) }),
    description: "Load a tenant's release history from its audit stream",
  },
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
    params: z
      .object({
        q: z.string().optional(),
        userId: z.string().optional(),
        userEmail: z.string().optional(),
      })
      .optional(),
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
  loadAudiencesAdmin: {
    description: "Load registered audience activities and tenant definitions",
  },
  loadAudienceBindings: {
    params: z.object({ audienceKey: z.string().min(1) }),
    description: "Load versioned bindings and published experience variants for an audience",
  },
  createAudience: {
    params: z.object({ key: z.string().min(2).max(64) }),
    description: "Create a stable tenant-owned audience definition",
  },
  createAudienceVersion: {
    params: z.object({
      audienceKey: z.string().min(1),
      activityType: z.string().min(1),
      activityVersion: z.number().int().positive(),
      condition: z.object({
        field: z.string().min(1),
        operator: z.enum(["equals", "notEquals", "in", "gt", "gte", "lt", "lte", "exists"]),
        value: z.unknown().optional(),
      }),
      action: z.enum(["assign", "remove"]),
      expiry: z
        .object({ afterMs: z.number().positive() })
        .or(z.object({ untilRevoked: z.literal(true) })),
    }),
    description: "Create an immutable draft audience rule version",
  },
  validateAudienceVersion: {
    params: z.object({ audienceKey: z.string().min(1), version: z.number().int().positive() }),
    description: "Validate a draft rule without recording sample membership",
  },
  activateAudienceVersion: {
    params: z.object({ audienceKey: z.string().min(1), version: z.number().int().positive() }),
    description: "Activate a validated audience rule version",
  },
  archiveAudience: {
    params: z.object({ audienceKey: z.string().min(1) }),
    description: "Archive a tenant audience definition",
  },
  createAudienceBinding: {
    params: z.object({
      audienceKey: z.string().min(1),
      input: z.object({
        pageKey: z.string().min(1),
        locale: z.string().nullable().optional(),
        schemaId: z.string().min(1),
        variantId: z.string().min(1),
        goalEvent: z.string().min(2),
        attributionWindowDays: z.number().finite().min(1).max(30),
      }),
    }),
    description: "Create a draft page and locale scoped experience binding",
  },
  activateAudienceBinding: {
    params: z.object({ audienceKey: z.string().min(1), version: z.number().int().positive() }),
    description: "Activate a versioned audience experience binding",
  },
  loadAudiencePerformance: {
    params: z.object({ audienceKey: z.string().min(1) }),
    description: "Load optional aggregate-only audience outcome metrics",
  },
  loadIntegrationsLlm: {
    description: "Load LLM integration settings (flags only, no secrets)",
  },
  saveIntegrationsLlm: {
    params: z.object({
      provider: z.enum(["openai", "anthropic"]),
      apiKey: z.string().optional(),
      allowPlatformFallback: z.boolean(),
    }),
    description: "Save LLM provider choice and optional BYOK API key to Vault",
  },
  loadIntegrationsComms: {
    description: "Load comms integration settings (flags only, no secrets)",
  },
  loadCommsDeliveries: {
    params: z
      .object({
        status: z.string().optional(),
      })
      .optional(),
    description: "Load recent email delivery log for this org",
  },
  loadCommsInbox: {
    params: z
      .object({
        unreadOnly: z.boolean().optional(),
      })
      .optional(),
    description: "Load in-app notification inbox for the signed-in admin user",
  },
  markCommsInboxRead: {
    params: z.object({
      itemId: z.string(),
    }),
    description: "Mark an in-app inbox item as read",
  },
  loadWebhookSubscriptions: {
    description: "Load outbound webhook subscriptions for this org",
  },
  loadWebhookOutboundDeliveries: {
    description: "Load outbound webhook delivery log for this org",
  },
  saveIntegrationsComms: {
    params: z.object({
      emailProvider: z.enum(COMMS_PROVIDERS),
      apiKey: z.string().optional(),
      fromEmail: z.string().email().optional(),
      fromName: z.string().optional(),
      mailgunDomain: z.string().trim().min(1).optional(),
    }),
    description: "Save email provider and optional BYOK API key to Vault",
  },
  loadIntegrationsOAuth: {
    description: "Load OAuth connection status (connectionId pointers only)",
  },
  startIntegrationsOAuthConnect: {
    params: z.object({
      integrationId: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[a-zA-Z0-9_-]+$/),
    }),
    description: "Start OAuth connect flow for an external integration",
  },
  loadScopeAdmin: {
    description: "Load teams, tags and access bindings for this org",
  },
  loadAgentsAdmin: {
    description: "Load registered agents and their access grants",
  },
};
