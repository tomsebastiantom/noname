import { NotFoundError } from "../../shared/domain-error";
import type { AnalyticsService } from "../analytics/ports";
import type {
  AudienceExperienceDeliveryService,
  AudienceExperienceMatch,
  ExperienceDecisionDimensions,
} from "../audiences/experience-attribution";
import type { AudienceMembershipService } from "../audiences/membership";
import type {
  ContentDocumentService,
  LayoutDocumentService,
  PageTreeService,
  TenantSettingsService,
} from "../documents/ports";
import { normalizeRoutePath } from "../documents/services/pages.service";
import type { FlagService } from "../flags/ports";
import { evaluationsToFlagMap } from "./flags-map";
import type { EdgeService, ExperienceAttribution, GetSchemaOptions } from "./ports";
import { parseContentRef, resolveSpecWithState } from "./resolve-spec";

const VISUAL_EDITOR_SHELL_REF = "visual_editor";
const DEFAULT_LAYOUT_VARIANT = "default";
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEdgeService(
  layout: LayoutDocumentService,
  content: ContentDocumentService,
  tenantSettings: TenantSettingsService,
  audiences: AudienceMembershipService & AudienceExperienceDeliveryService,
  flagService: FlagService,
  analytics: AnalyticsService,
  pages: PageTreeService,
): EdgeService {
  return {
    async getSchema(siteId, options: GetSchemaOptions = {}) {
      let template = options.template ?? "home";
      let contentRef = options.contentRef ?? null;
      let locale: string | null = options.locale ?? null;
      let resolvedPageKey: string | null = null;

      if (options.url) {
        const settings = await tenantSettings.get(siteId);
        locale = canonicalLocale(locale ?? settings.defaultLocale ?? "en-US") ?? "en-US";
        const route = await pages.resolveByUrl(siteId, options.url, locale);
        if (route) {
          template = route.layoutRef || template;
          contentRef = route.contentRef || contentRef;
          resolvedPageKey = normalizePageKey(options.url, template);
        }
      } else {
        locale = canonicalLocale(locale);
      }

      const pageKey = resolvedPageKey ?? normalizePageKey(options.url, template);
      const verifiedUserId = options.verifiedUserId?.trim() || null;
      const sessionId = validSessionId(options.sessionId);
      const memberships = verifiedUserId
        ? await audiences.getActiveMemberships(siteId, verifiedUserId)
        : [];

      let experienceMatch: AudienceExperienceMatch | null = null;
      if (verifiedUserId && options.url && !options.edit) {
        experienceMatch = await audiences.resolveExperience(siteId, verifiedUserId, {
          pageKey,
          locale,
        });
      }

      // A binding selects only a published layout variant and an attributable request.
      // Missing decision context or a stale/misconfigured binding falls back to default.
      let layoutVariant = experienceMatch?.binding.variantId ?? DEFAULT_LAYOUT_VARIANT;
      let resolved = await layout.resolve(siteId, template, layoutVariant);
      if (experienceMatch && (!resolved || !verifiedUserId || !sessionId)) {
        experienceMatch = null;
        layoutVariant = DEFAULT_LAYOUT_VARIANT;
        resolved = await layout.resolve(siteId, template, layoutVariant);
      }

      let experience: ExperienceAttribution | null = null;
      if (experienceMatch && verifiedUserId && sessionId) {
        try {
          const decision = await audiences.createExperienceDecision(
            siteId,
            verifiedUserId,
            sessionId,
            experienceMatch,
          );
          experience = toExperienceAttribution(decision);
        } catch {
          experienceMatch = null;
          layoutVariant = DEFAULT_LAYOUT_VARIANT;
          resolved = await layout.resolve(siteId, template, layoutVariant);
        }
      }

      const effectiveContentRef = contentRef ?? resolved?.contentRef ?? null;
      const subject = verifiedUserId
        ? { kind: "account" as const, key: verifiedUserId }
        : sessionId
          ? { kind: "session" as const, key: sessionId }
          : { kind: "global" as const, key: "global" };
      const contextProperties = Object.fromEntries(
        Object.entries({ pageKey, locale, layoutVariant: experience?.variantId }).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );

      const flags = await flagService.evaluate(siteId, {
        orgId: siteId,
        subject,
        audienceKeys: memberships.map((membership) => membership.audienceKey),
        contextProperties,
        schemaId: experience?.schemaId ?? null,
        // Experience variantId is the string layout segment, not the UUID flag-scope ID.
        // Expose it as the server-derived `layoutVariant` property instead.
        variantId: null,
      });
      const flagMap = evaluationsToFlagMap(flags);

      const renderAs = resolved?.renderAs ?? "standalone";
      const shellRef = resolved?.shellRef ?? null;
      let layoutSpec = resolved?.spec ?? null;
      let shellSpec: Record<string, unknown> | null = null;

      if (renderAs === "panel" && shellRef) {
        const shellResolved = await layout.resolve(siteId, shellRef, layoutVariant);
        shellSpec = shellResolved?.spec ?? null;
      }

      if (layoutSpec) {
        layoutSpec = await mergeContentIntoSpec(siteId, layoutSpec, {
          contentRef: effectiveContentRef,
          locale: locale ?? undefined,
          tenantSettings,
          content,
        });
      }

      if (options.edit) {
        const editorShellResolved = await layout.resolve(
          siteId,
          VISUAL_EDITOR_SHELL_REF,
          DEFAULT_LAYOUT_VARIANT,
        );
        const editorShellSpec = editorShellResolved?.spec ?? null;
        if (!editorShellSpec) {
          throw new NotFoundError("Editor shell layout", VISUAL_EDITOR_SHELL_REF);
        }

        return {
          siteId,
          layout: layoutSpec,
          templateName: template,
          renderAs: "editor",
          shell: editorShellSpec,
          shellRef: VISUAL_EDITOR_SHELL_REF,
          flags: flagMap,
          requestContext: { pageKey, locale },
          experience: null,
          contentRef: effectiveContentRef,
        };
      }

      if (experience) {
        await analytics.ingestServerEvent("experience.served", {
          orgId: siteId,
          sessionId: sessionId ?? "",
          audienceKey: experience.audienceKey,
          audienceDefinitionVersion: experience.audienceDefinitionVersion,
          bindingId: experience.bindingId,
          bindingVersion: experience.bindingVersion,
          decisionId: experience.decisionId,
          pageKey: experience.pageKey,
          locale: experience.locale,
          schemaId: experience.schemaId,
          variantId: experience.variantId,
        });
      }

      return {
        siteId,
        layout: layoutSpec,
        templateName: template,
        renderAs,
        shell: shellSpec,
        shellRef,
        flags: flagMap,
        requestContext: { pageKey, locale },
        experience,
        contentRef: effectiveContentRef,
      };
    },

    async recordExperienceRendered(siteId, verifiedUserId, sessionId, decisionId) {
      const marked = await audiences.markExperienceDecisionRendered(
        siteId,
        verifiedUserId,
        sessionId,
        decisionId,
      );
      if (!marked) return false;

      const dimensions = marked.dimensions;
      await analytics.ingestServerEvent("experience.rendered", {
        orgId: siteId,
        sessionId: dimensions.sessionId,
        audienceKey: dimensions.audienceKey,
        audienceDefinitionVersion: dimensions.audienceDefinitionVersion,
        bindingId: dimensions.bindingId,
        bindingVersion: dimensions.bindingVersion,
        decisionId: dimensions.decisionId,
        pageKey: dimensions.pageKey,
        locale: dimensions.locale,
        schemaId: dimensions.schemaId,
        variantId: dimensions.variantId,
      });
      return true;
    },
  };
}

function toExperienceAttribution(decision: ExperienceDecisionDimensions): ExperienceAttribution {
  return {
    audienceKey: decision.audienceKey,
    audienceDefinitionVersion: decision.audienceDefinitionVersion,
    bindingId: decision.bindingId,
    bindingVersion: decision.bindingVersion,
    decisionId: decision.decisionId,
    pageKey: decision.pageKey,
    locale: decision.locale,
    schemaId: decision.schemaId,
    variantId: decision.variantId,
  };
}

function normalizePageKey(url: string | undefined, template: string): string {
  if (!url) return template;
  try {
    return normalizeRoutePath(new URL(url, "http://localhost").pathname);
  } catch {
    return normalizeRoutePath(url.split(/[?#]/, 1)[0] ?? "/");
  }
}

function canonicalLocale(locale: string | null): string | null {
  if (!locale?.trim()) return null;
  try {
    return Intl.getCanonicalLocales(locale.trim())[0] ?? null;
  } catch {
    return null;
  }
}

function validSessionId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && SESSION_ID_RE.test(normalized) ? normalized : null;
}

async function mergeContentIntoSpec(
  orgId: string,
  spec: Record<string, unknown>,
  ctx: {
    contentRef: string | null;
    locale?: string;
    tenantSettings: TenantSettingsService;
    content: ContentDocumentService;
  },
): Promise<Record<string, unknown>> {
  const contentRef = ctx.contentRef;
  if (!contentRef) return spec;

  const parsed = parseContentRef(contentRef);
  if (!parsed) return spec;

  const settings = await ctx.tenantSettings.get(orgId);
  const locale = ctx.locale ?? settings.defaultLocale ?? "en-US";
  const stateModel = await ctx.content.resolve(orgId, parsed.type, parsed.id, locale);
  if (!stateModel) return spec;

  return resolveSpecWithState(spec, stateModel);
}
