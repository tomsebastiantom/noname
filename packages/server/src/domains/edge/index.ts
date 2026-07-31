import type { ContextEngine } from "../context/ports";
import type {
  ContentDocumentService,
  LayoutDocumentService,
  PageTreeService,
  TenantSettingsService,
} from "../documents/contracts";
import type { FlagService } from "../flags/ports";
import { createEdgeRoutes } from "./api";
import { createEdgeService } from "./service";

export interface EdgeDomainDeps {
  layout: LayoutDocumentService;
  content: ContentDocumentService;
  tenantSettings: TenantSettingsService;
  pages: PageTreeService;
  context: ContextEngine;
  flags: FlagService;
}

export function createEdgeDomain(deps: EdgeDomainDeps) {
  const service = createEdgeService(
    deps.layout,
    deps.content,
    deps.tenantSettings,
    deps.context,
    deps.flags,
    deps.pages,
  );
  const routes = createEdgeRoutes(service, deps.tenantSettings);
  return { service, routes };
}
