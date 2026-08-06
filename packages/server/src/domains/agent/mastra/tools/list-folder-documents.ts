import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AuthorizationPort } from "../../../auth/authorization-port";
import type { DocumentDTO, DocumentStorage } from "../../../documents/ports";
import type { AgentRunContext } from "../context";
import { agentCanViewCollection } from "../scope";

function summarizeListItem(doc: DocumentDTO) {
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
    updatedAt: doc.updatedAt.toISOString(),
    title,
  };
}

export function createListFolderDocumentsTool(
  deps: {
    storage: Pick<DocumentStorage, "findCollectionIdBySlug" | "listDocuments">;
    authorization: AuthorizationPort;
    runContext: AgentRunContext | null;
  },
  orgId: string,
) {
  return createTool({
    id: "listFolderDocuments",
    description:
      "List CMS documents in a folder (content collection slug) for the current organization",
    inputSchema: z.object({
      folderSlug: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9-]+$/),
      type: z.string().trim().min(1).max(64).optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ folderSlug, type, status, limit }) => {
      const agentSlug = deps.runContext?.agentSlug;
      if (!agentSlug) {
        return { allowed: false, reason: "missing_agent_context", folderSlug };
      }

      const allowed = await agentCanViewCollection(
        deps.authorization,
        agentSlug,
        folderSlug,
        deps.runContext?.onBehalfOf,
      );
      if (!allowed) {
        return { allowed: false, reason: "forbidden", folderSlug };
      }

      const collectionId = await deps.storage.findCollectionIdBySlug(orgId, folderSlug);
      if (!collectionId) {
        return {
          found: false,
          folderSlug,
          documents: [] as ReturnType<typeof summarizeListItem>[],
        };
      }

      const rows = await deps.storage.listDocuments(orgId, {
        collectionId,
        type,
        status,
      });

      const resolvedLimit = limit ?? 50;
      const documents = rows.slice(0, resolvedLimit).map(summarizeListItem);

      return {
        found: true,
        folderSlug,
        collectionId,
        count: documents.length,
        documents,
      };
    },
  });
}
