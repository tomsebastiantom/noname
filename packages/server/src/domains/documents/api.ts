import { Hono } from "hono";
import { createAuthorization } from "../auth/create-authorization";
import type { AssetBinaryStorage } from "./assets/binary";
import { createAssetStorage } from "./assets/binary";
import type { DocumentService, DocumentStorage } from "./ports";
import { registerAssetRoutes } from "./routes/assets";
import { registerContentRoutes } from "./routes/content";
import { registerContentTypeRoutes } from "./routes/content-types";
import type { DocumentsRouteDeps } from "./routes/deps";
import { registerLayoutRoutes } from "./routes/layout";
import { registerPageRoutes } from "./routes/pages";
import { registerRefRoutes } from "./routes/refs";
import { registerTenantSettingsRoutes } from "./routes/tenant-settings";

export function createDocumentsRoutes(
  service: DocumentService,
  storage: DocumentStorage,
  binary?: AssetBinaryStorage,
  authorization = createAuthorization(),
) {
  const routes = new Hono();
  const assetBinary = binary ?? createAssetStorage();
  const deps: DocumentsRouteDeps = { service, storage, authorization };

  registerContentTypeRoutes(routes, deps);
  registerTenantSettingsRoutes(routes, deps);
  registerAssetRoutes(routes, deps, assetBinary);
  registerLayoutRoutes(routes, deps);
  registerPageRoutes(routes, deps);
  registerRefRoutes(routes, deps);
  registerContentRoutes(routes, deps);

  return routes;
}
