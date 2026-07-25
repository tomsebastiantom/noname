import type { Database } from "../../drizzle";
import { createPostgresDocumentStorage } from "./adapters/postgres";
import { createDocumentsRoutes } from "./api";
import type { AssetBinaryStorage } from "./assets/binary";
import type { ContentValidator, DocumentStorage } from "./ports";
import { createDocumentsService } from "./service";
import { contentValidator } from "./validator";

export interface DocumentsDomainDeps {
  db: Database;
  storage?: DocumentStorage;
  validator?: ContentValidator;
  assetBinary?: AssetBinaryStorage;
}

export function createDocumentsDomain(deps: DocumentsDomainDeps) {
  const storage = deps.storage ?? createPostgresDocumentStorage(deps.db);
  const service = createDocumentsService(storage, deps.validator ?? contentValidator);
  const routes = createDocumentsRoutes(service, deps.assetBinary);
  return { storage, service, routes };
}
