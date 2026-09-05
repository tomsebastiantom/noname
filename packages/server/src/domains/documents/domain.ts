import type { Database } from "../../drizzle";
import type { AuthorizationPort } from "../auth/authorization-port";
import { createPostgresDocumentStorage } from "./adapters/postgres";
import { createDocumentsRoutes } from "./api";
import type { AssetBinaryStorage } from "./assets/binary";
import type { ContentValidator, DocumentStorage } from "./ports";
import { createDocumentsService } from "./service";
import { contentValidator } from "./validation/validator";

export interface DocumentsDomainDeps {
  db: Database;
  storage?: DocumentStorage;
  validator?: ContentValidator;
  assetBinary?: AssetBinaryStorage;
  authorization: AuthorizationPort;
  onContentPublished?: (orgId: string, type: string, id: string) => Promise<void>;
}

export function createDocumentsDomain(deps: DocumentsDomainDeps) {
  const storage = deps.storage ?? createPostgresDocumentStorage(deps.db);
  const service = createDocumentsService(storage, deps.validator ?? contentValidator, {
    onContentPublished: deps.onContentPublished,
  });
  const routes = createDocumentsRoutes(service, storage, deps.assetBinary, deps.authorization);
  return { storage, service, routes };
}
