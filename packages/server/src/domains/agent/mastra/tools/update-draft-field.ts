import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AuthorizationPort } from "../../../auth/authorization-port";
import type { ContentDocumentService, DocumentStorage } from "../../../documents/ports";
import type { AgentCollabRuntime } from "../../collab/agent-collab-runtime";
import { parseAgentRichTextFieldValue } from "../../collab/parse-agent-richtext-value";
import type { ArtifactCollector } from "../artifacts";
import type { AgentRunContext } from "../context";
import { writeAuditFromRunContext } from "../context";
import { agentCanEditDocument } from "../scope";

export function createUpdateDraftFieldTool(
  deps: {
    storage: Pick<DocumentStorage, "findDocumentById" | "findCollectionSlug">;
    content: Pick<ContentDocumentService, "updateById">;
    authorization: AuthorizationPort;
    artifacts: ArtifactCollector;
    runContext: AgentRunContext | null;
    collabRuntime: AgentCollabRuntime;
  },
  orgId: string,
) {
  return createTool({
    id: "updateDraftField",
    description:
      "Patch a single field on a CMS content draft (requires human review before publish)",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(128),
      contentType: z.string().trim().min(1).max(64),
      fieldKey: z.string().trim().min(1).max(128),
      value: z.unknown(),
      locale: z.string().trim().min(2).max(16).optional(),
    }),
    execute: async ({ documentId, contentType, fieldKey, value, locale }) => {
      const agentSlug = deps.runContext?.agentSlug;
      if (!agentSlug) {
        return { allowed: false, reason: "missing_agent_context", documentId };
      }

      const doc = await deps.storage.findDocumentById(documentId);
      if (!doc || doc.orgId !== orgId) {
        return { found: false, documentId };
      }
      if (doc.type !== contentType) {
        return {
          found: true,
          updated: false,
          reason: "content_type_mismatch",
          documentId,
          expectedType: contentType,
          actualType: doc.type,
        };
      }
      if (doc.status !== "draft") {
        return {
          found: true,
          updated: false,
          reason: "not_draft",
          documentId,
          status: doc.status,
        };
      }

      const collectionSlug = doc.collectionId
        ? await deps.storage.findCollectionSlug(orgId, doc.collectionId)
        : null;

      const allowed = await agentCanEditDocument(
        deps.authorization,
        agentSlug,
        { id: doc.id, collectionSlug },
        deps.runContext?.onBehalfOf,
      );
      if (!allowed) {
        return { allowed: false, reason: "forbidden", documentId };
      }

      const audit = deps.runContext ? writeAuditFromRunContext(deps.runContext) : undefined;
      const resolvedLocale = locale ?? "en-US";
      const richTextSession = deps.collabRuntime.getRichTextSession();
      const viaCollabSession =
        richTextSession?.matches(documentId, fieldKey, resolvedLocale) ?? false;
      const richTextDoc = viaCollabSession ? parseAgentRichTextFieldValue(value) : null;

      if (viaCollabSession && richTextDoc) {
        await richTextSession.applyRichTextDocument(richTextDoc);
        deps.artifacts.push({
          kind: "content",
          documentId: doc.id,
          label: `${contentType}.${fieldKey}`,
        });
        return {
          updated: true,
          via: "collab",
          contentId: doc.id,
          contentType,
          fieldKey,
          status: doc.status,
        };
      } else if (viaCollabSession) {
        richTextSession.pulseAwareness();
      }

      const updated = await deps.content.updateById(
        orgId,
        contentType,
        documentId,
        { [fieldKey]: value },
        { locale: resolvedLocale, audit },
      );

      deps.artifacts.push({
        kind: "content",
        documentId: updated.id,
        label: `${contentType}.${fieldKey}`,
      });

      return {
        updated: true,
        via: "http",
        contentId: updated.id,
        contentType: updated.type,
        fieldKey,
        status: updated.status,
      };
    },
  });
}
