import type { AuthorizationPort } from "../../auth/authorization-port";
import type { DocumentService, DocumentStorage } from "../ports";

export interface DocumentsRouteDeps {
  service: DocumentService;
  storage: DocumentStorage;
  authorization: AuthorizationPort;
}
