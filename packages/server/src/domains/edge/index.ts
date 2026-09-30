import type { AnalyticsService } from "../analytics/ports";
import type { AudienceExperienceDeliveryService } from "../audiences/experience-attribution";
import type { AudienceMembershipService } from "../audiences/membership";
import type {
  ContentDocumentService,
  LayoutDocumentService,
  PageTreeService,
  TenantSettingsService,
} from "../documents/ports";
import type { FlagService } from "../flags/ports";
import { createEdgeRoutes } from "./api";
import { createEdgeService } from "./service";

export interface EdgeDomainDeps {
  layout: LayoutDocumentService;
  content: ContentDocumentService;
  tenantSettings: TenantSettingsService;
  pages: PageTreeService;
  audiences: AudienceMembershipService & AudienceExperienceDeliveryService;
  flags: FlagService;
  analytics: AnalyticsService;
}

export function createEdgeDomain(deps: EdgeDomainDeps) {
  const service = createEdgeService(
    deps.layout,
    deps.content,
    deps.tenantSettings,
    deps.audiences,
    deps.flags,
    deps.analytics,
    deps.pages,
  );
  const routes = createEdgeRoutes(service, deps.tenantSettings);
  return { service, routes };
}
