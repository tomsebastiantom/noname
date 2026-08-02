import type { ContextService } from "../context/ports";
import type {
  ContentDocumentService,
  LayoutDocumentService,
  PageTreeService,
  TenantSettingsService,
} from "../documents/contracts";
import type { FlagService } from "../flags/ports";
import { evaluationsToFlagMap } from "./flags-map";
import type { EdgeService, GetSchemaOptions } from "./ports";
import { parseContentRef, resolveSpecWithState } from "./resolve-spec";

export function createEdgeService(
  layout: LayoutDocumentService,
  content: ContentDocumentService,
  tenantSettings: TenantSettingsService,
  contextService: ContextService,
  flagService: FlagService,
  pages: PageTreeService,
): EdgeService {
  return {
    async getSchema(siteId, options: GetSchemaOptions = {}) {
      const segment = options.segment ?? "default";
      let template = options.template ?? "home";
      let contentRef = options.contentRef ?? null;
      let locale = options.locale;

      if (options.url) {
        const settings = await tenantSettings.get(siteId);
        locale = locale ?? settings.defaultLocale ?? "en-US";
        const route = await pages.resolveByUrl(siteId, options.url, locale);
        if (route) {
          template = route.layoutRef || template;
          contentRef = route.contentRef || contentRef;
        }
      }

      const resolved = await layout.resolve(siteId, template, segment);
      const effectiveContentRef = contentRef ?? resolved?.contentRef ?? null;

      const flags = await flagService.evaluate(siteId, {
        orgId: siteId,
        contextHash: segment,
        contextProperties: {},
        schemaId: null,
        variantId: null,
      });

      const flagMap = evaluationsToFlagMap(flags);

      const renderAs = resolved?.renderAs ?? "standalone";
      const shellRef = resolved?.shellRef ?? null;
      let layoutSpec = resolved?.spec ?? null;
      let shellSpec: Record<string, unknown> | null = null;

      if (renderAs === "panel" && shellRef) {
        const shellResolved = await layout.resolve(siteId, shellRef, segment);
        shellSpec = shellResolved?.spec ?? null;
      }

      if (layoutSpec) {
        layoutSpec = await mergeContentIntoSpec(siteId, layoutSpec, {
          contentRef: effectiveContentRef,
          locale,
          tenantSettings,
          content,
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
        segment,
        contentRef: effectiveContentRef,
      };
    },

    async personalize(orgId, input) {
      const headers = input.headers ?? {};
      const segment = await contextService.segmentForRequest(orgId, headers);

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

      const flagMap = evaluationsToFlagMap(flags);

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
        templateName: "home",
        renderAs: resolved?.renderAs ?? "standalone",
        shell: null,
        shellRef: resolved?.shellRef ?? null,
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
