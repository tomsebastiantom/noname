import type { EdgeService } from "./ports";
import type { LayoutDocumentService } from "../documents/ports";
import type { ContextEngine } from "../context/ports";
import type { FlagService } from "../flags/ports";

export function createEdgeService(
  layout: LayoutDocumentService,
  contextEngine: ContextEngine,
  flagService: FlagService,
): EdgeService {
  return {
    async getSchema(siteId, segment = "default") {
      const resolved = await layout.resolve(siteId, "store", segment);
      const flags = await flagService.evaluate(siteId, {
        tenantId: siteId,
        contextHash: segment,
        contextProperties: {},
        schemaId: null,
        variantId: null,
      });

      const flagMap: Record<string, unknown> = {};
      for (const f of flags) {
        flagMap[f.flagKey] = f.value;
      }

      return {
        siteId,
        layout: resolved?.spec ?? null,
        flags: flagMap,
        segment,
      };
    },

    async personalize(tenantId, input) {
      const headers = input.headers ?? {};
      const segment = await contextEngine.segmentForRequest(tenantId, headers);

      const resolved = await layout.resolve(tenantId, "store", segment.hash);

      const flags = await flagService.evaluate(
        tenantId,
        {
          tenantId,
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

      return {
        siteId: input.siteId,
        segment: segment.hash,
        layout: resolved?.spec ?? null,
        flags: flagMap,
      };
    },
  };
}
