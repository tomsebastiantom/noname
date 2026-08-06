import type { LayoutCollabRoomManager } from "../collab/layout-room";
import type { LayoutDocumentService } from "../documents/ports";
import { normalizeLayoutSpec } from "../documents/services/normalize-layout-spec";
import {
  type LayoutPatchRevertTarget,
  layoutPatchRevertTargetsFromTask,
} from "./layout-patch-revert-specs";
import type { AgentTaskDTO } from "./ports";

export type LayoutPatchRevertDeps = {
  layout: Pick<LayoutDocumentService, "update" | "get">;
  layoutCollabRooms: Pick<
    LayoutCollabRoomManager,
    "applySpec" | "flushPersist" | "syncFromDatabase"
  >;
};

export type RevertedLayoutSpec = {
  layoutDocumentId: string;
  spec: Record<string, unknown>;
  label: string;
};

export async function revertAgentTaskLayoutPatches(
  orgId: string,
  task: Pick<AgentTaskDTO, "output">,
  deps: LayoutPatchRevertDeps,
): Promise<RevertedLayoutSpec[]> {
  const targets = layoutPatchRevertTargetsFromTask(task);
  const reverted: RevertedLayoutSpec[] = [];

  for (const target of targets) {
    reverted.push(await revertOneLayoutPatch(orgId, target, deps));
  }
  return reverted;
}

async function revertOneLayoutPatch(
  orgId: string,
  target: LayoutPatchRevertTarget,
  deps: LayoutPatchRevertDeps,
): Promise<RevertedLayoutSpec> {
  const { layoutDocumentId } = target;
  const revertSpec = normalizeLayoutSpec(target.revertSpec);

  try {
    await deps.layoutCollabRooms.applySpec(orgId, layoutDocumentId, revertSpec);
    await deps.layoutCollabRooms.flushPersist(orgId, layoutDocumentId);
    await deps.layoutCollabRooms.syncFromDatabase(orgId, layoutDocumentId);
  } catch {
    await deps.layout.update(orgId, layoutDocumentId, { spec: revertSpec });
    try {
      await deps.layoutCollabRooms.syncFromDatabase(orgId, layoutDocumentId);
    } catch {
      // Room may be cold — HTTP revert is enough for reload.
    }
  }

  return { layoutDocumentId, spec: revertSpec, label: target.label };
}
