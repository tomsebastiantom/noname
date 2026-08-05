import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AuthorizationPort } from "../../../auth/authorization-port";
import type { DocumentDTO, DocumentStorage } from "../../../documents/ports";
import type { AgentRunContext } from "../context";
import { agentCanViewDocument } from "../scope";

function summarizeDocument(doc: DocumentDTO) {
  const title =
    typeof doc.data.title === "string"
      ? doc.data.title
      : typeof doc.data.name === "string"
        ? doc.data.name
        : undefined;

  return {
    id: doc.id,
    type: doc.type,
    key: doc.key,
    status: doc.status,
    segment: doc.segment,
    collectionId: doc.collectionId,
    updatedAt: doc.updatedAt.toISOString(),
    title,
    data: doc.data,
  };
}

export function createReadDocumentTool(
  deps: {
    storage: Pick<DocumentStorage, "findDocumentById" | "findCollectionSlug">;
    authorization: AuthorizationPort;
    runContext: AgentRunContext | null;
  },
  orgId: string,
) {
  return createTool({
    id: "readDocument",
    description: "Read a CMS document (content or layout) by id for the current organization",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(128),
    }),
    execute: async ({ documentId }) => {
      const agentSlug = deps.runContext?.agentSlug;
      if (!agentSlug) {
        return { allowed: false, reason: "missing_agent_context", documentId };
      }

      const doc = await deps.storage.findDocumentById(documentId);
      if (!doc || doc.orgId !== orgId) {
        return { found: false, documentId };
      }

      const collectionSlug = doc.collectionId
        ? await deps.storage.findCollectionSlug(orgId, doc.collectionId)
        : null;

      const allowed = await agentCanViewDocument(deps.authorization, agentSlug, {
        id: doc.id,
        collectionSlug,
      });
      if (!allowed) {
        return { allowed: false, reason: "forbidden", documentId };
      }

      return {
        found: true,
        document: summarizeDocument(doc),
      };
    },
  });
}
