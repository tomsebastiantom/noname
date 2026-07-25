import type { ContentDocumentService, LayoutDocumentService, TenantSettingsService } from "../documents/ports";
import type { ContextEngine } from "../context/ports";
import type { FlagService } from "../flags/ports";
import type { EdgeService, GetSchemaOptions } from "./ports";
import { parseContentRef, resolveSpecWithState } from "./resolve-spec";

export function createEdgeService(
  layout: LayoutDocumentService,
  content: ContentDocumentService,
  tenantSettings: TenantSettingsService,
  contextEngine: ContextEngine,
  flagService: FlagService,
): EdgeService {
  return {
    async getSchema(siteId, options: GetSchemaOptions = {}) {
      const segment = options.segment ?? "default";
      const template = options.template ?? "home";
      const resolved = await layout.resolve(siteId, template, segment);

      const flags = await flagService.evaluate(siteId, {
        orgId: siteId,
        contextHash: segment,
        contextProperties: {},
        schemaId: null,
        variantId: null,
      });

      const flagMap: Record<string, unknown> = {};
      for (const f of flags) {
        flagMap[f.flagKey] = f.value;
      }

      let layoutSpec = resolved?.spec ?? null;
      if (layoutSpec) {
        layoutSpec = await mergeContentIntoSpec(siteId, layoutSpec, {
          contentRef: options.contentRef ?? resolved?.contentRef ?? null,
          locale: options.locale,
          tenantSettings,
          content,
        });
      }

      return {
        siteId,
        layout: layoutSpec,
        flags: flagMap,
        segment,
      };
    },

    async personalize(orgId, input) {
      const headers = input.headers ?? {};
      const segment = await contextEngine.segmentForRequest(orgId, headers);

      const resolved = await layout.resolve(orgId, "home", segment.hash);

      const flags = await flagService.evaluate(
        orgId,
        {
          orgId,
          contextHash: segment.hash,
          contextProperties: {},
          schemaId: null,
          variantId: null,
        },
        input.flagKeys,
      );

      const flagMap: Record<string, unknown> = {};
      for (const f of flags) {
        flagMap[f.flagKey] = f.value;
      }

      let layoutSpec = resolved?.spec ?? null;
      if (layoutSpec) {
        layoutSpec = await mergeContentIntoSpec(orgId, layoutSpec, {
          contentRef: resolved?.contentRef ?? null,
          tenantSettings,
          content,
        });
      }

      return {
        siteId: input.siteId,
        segment: segment.hash,
        layout: layoutSpec,
        flags: flagMap,
      };
    },
  };
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
