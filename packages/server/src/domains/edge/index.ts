import type { ContextEngine } from "../context/ports";
import type {
  ContentDocumentService,
  LayoutDocumentService,
  TenantSettingsService,
} from "../documents/ports";
import type { FlagService } from "../flags/ports";
import { createEdgeRoutes } from "./api";
import { createEdgeService } from "./service";

export interface EdgeDomainDeps {
  layout: LayoutDocumentService;
  content: ContentDocumentService;
  tenantSettings: TenantSettingsService;
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
  );
  const routes = createEdgeRoutes(service);
  return { service, routes };
}
