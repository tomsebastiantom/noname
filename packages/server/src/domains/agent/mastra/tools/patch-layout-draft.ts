import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { recordDocumentOp } from "../../../../shared/document-audit";
import { StorageError } from "../../../../shared/domain-error";
import type { AuthorizationPort } from "../../../auth/authorization-port";
import type { LayoutCollabRoomManager } from "../../../collab/layout-room";
import { buildSpecPatchPayload } from "../../../documents/document-op-payload";
import type { DocumentStorage, LayoutDocumentService, LayoutDTO } from "../../../documents/ports";
import {
  layoutSpecsEqual,
  normalizeLayoutSpec,
} from "../../../documents/services/normalize-layout-spec";
import type { AgentCollabRuntime } from "../../collab/agent-collab-runtime";
import { layoutCollabSessionOptions } from "../../collab/layout-collab-session-options";
import type { ArtifactCollector } from "../artifacts";
import type { AgentRunContext } from "../context";
import { writeAuditFromRunContext } from "../context";
import { agentCanEditDocument, isEditorScopedLayout } from "../scope";

export function createPatchLayoutDraftTool(
  deps: {
    storage: Pick<DocumentStorage, "findDocumentById" | "findCollectionSlug" | "recordDocumentOp">;
    layout: Pick<LayoutDocumentService, "update" | "get">;
    authorization: AuthorizationPort;
    artifacts: ArtifactCollector;
    runContext: AgentRunContext | null;
    layoutCollabRooms: Pick<LayoutCollabRoomManager, "getSpec" | "applySpec" | "flushPersist">;
    collabRuntime: AgentCollabRuntime | null;
  },
  orgId: string,
) {
  return createTool({
    id: "patchLayoutDraft",
    description:
      "Patch the layout spec on the current page. Works while the human has the editor open (live collab), including published layouts. Pass the full updated spec. TextBase block copy lives at elements[id].props.content.",
    inputSchema: z.object({
      layoutDocumentId: z.string().trim().min(1).max(128),
      spec: z.record(z.string(), z.unknown()),
      focusElementId: z.string().trim().min(1).max(256).optional(),
    }),
    execute: async ({ layoutDocumentId, spec: rawSpec, focusElementId }) => {
      const agentSlug = deps.runContext?.agentSlug;
      if (!agentSlug) {
        return { allowed: false, reason: "missing_agent_context", layoutDocumentId };
      }

      const spec = normalizeLayoutSpec(rawSpec);

      const doc = await deps.storage.findDocumentById(layoutDocumentId);
      if (!doc || doc.orgId !== orgId) {
        return { found: false, layoutDocumentId };
      }
      if (doc.type !== "layout") {
        return {
          found: true,
          updated: false,
          reason: "not_layout",
          layoutDocumentId,
          actualType: doc.type,
        };
      }

      const collectionSlug = doc.collectionId
        ? await deps.storage.findCollectionSlug(orgId, doc.collectionId)
        : null;

      const editorScoped = isEditorScopedLayout(deps.runContext, layoutDocumentId);

      if (!editorScoped) {
        const allowed = await agentCanEditDocument(
          deps.authorization,
          agentSlug,
          { id: doc.id, collectionSlug },
          deps.runContext?.onBehalfOf,
        );
        if (!allowed) {
          return { allowed: false, reason: "forbidden", layoutDocumentId };
        }
      }

      const audit = deps.runContext ? writeAuditFromRunContext(deps.runContext) : undefined;

      async function persistViaHttp(): Promise<LayoutDTO> {
        return deps.layout.update(orgId, layoutDocumentId, { spec }, { audit });
      }

      async function recordCollabAudit(previousSpec: Record<string, unknown>): Promise<void> {
        if (!audit) return;
        const row = await deps.layout.get(orgId, layoutDocumentId);
        await recordDocumentOp(deps.storage, {
          orgId,
          documentId: layoutDocumentId,
          operation: "update",
          audit,
          payload: buildSpecPatchPayload(previousSpec, spec, row?.updatedAt.toISOString()),
        });
      }

      if (editorScoped) {
        const previousSpec = await deps.layoutCollabRooms.getSpec(orgId, layoutDocumentId);
        if (layoutSpecsEqual(previousSpec, spec)) {
          return {
            updated: false,
            reason: "spec_unchanged",
            layoutDocumentId: doc.id,
            status: doc.status,
          };
        }

        try {
          await deps.layoutCollabRooms.applySpec(orgId, layoutDocumentId, spec);
          await deps.layoutCollabRooms.flushPersist(orgId, layoutDocumentId);
          const applied = await deps.layoutCollabRooms.getSpec(orgId, layoutDocumentId);
          if (layoutSpecsEqual(previousSpec, applied)) {
            throw new StorageError("Collab room spec did not change after apply");
          }
        } catch (err) {
          const collabError = err instanceof Error ? err.message : String(err);
          const updated = await persistViaHttp();
          deps.artifacts.push({
            kind: "layout",
            documentId: updated.id,
            label: updated.key ?? "layout",
            revertSpec: previousSpec,
            liveEditorPatch: true,
          });
          return {
            updated: true,
            via: "http",
            layoutDocumentId: updated.id,
            status: updated.status,
            collabFallbackReason: collabError,
          };
        }

        await recordCollabAudit(previousSpec);
        deps.artifacts.push({
          kind: "layout",
          documentId: doc.id,
          label: doc.key ?? "layout",
          revertSpec: previousSpec,
          liveEditorPatch: true,
        });

        if (deps.runContext && deps.collabRuntime) {
          const session = await deps.collabRuntime.ensureLayoutSession(
            layoutCollabSessionOptions(deps.runContext, layoutDocumentId),
          );
          session?.focusElement(focusElementId ?? null, previousSpec, spec);
        }

        return {
          updated: true,
          via: "collab",
          layoutDocumentId: doc.id,
          status: doc.status,
        };
      }

      const existing = await deps.layout.get(orgId, layoutDocumentId);
      const previousSpec = (existing?.data.spec ?? {}) as Record<string, unknown>;
      const updated = await persistViaHttp();

      deps.artifacts.push({
        kind: "layout",
        documentId: updated.id,
        label: updated.key ?? "layout",
        revertSpec: previousSpec,
      });

      return {
        updated: true,
        via: "http",
        layoutDocumentId: updated.id,
        status: updated.status,
        previousSpecKeys: Object.keys(previousSpec.elements ?? {}).length,
      };
    },
  });
}
