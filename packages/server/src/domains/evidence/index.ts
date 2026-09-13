import type { Database } from "../../drizzle";
import { createEvidencePostgresService } from "./adapters/postgres";
import type { EvidenceService } from "./ports";
import { createEvidenceRoutes } from "./routes";

export type {
  EvidenceActivity,
  EvidenceActivityInput,
  EvidenceAuditEvent,
  EvidenceAuditInput,
  EvidenceLink,
  EvidenceLinkInput,
  EvidenceListQuery,
  EvidenceRecord,
  EvidenceRecordInput,
  EvidenceService,
} from "./ports";

export function createEvidenceDomain(deps: { db: Database; service?: EvidenceService }) {
  const service = deps.service ?? createEvidencePostgresService(deps.db);
  return { service, routes: createEvidenceRoutes(service) };
}
