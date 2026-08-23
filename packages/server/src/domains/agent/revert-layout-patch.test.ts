import { describe, expect, it, vi } from "vitest";
import { revertAgentTaskLayoutPatches } from "./revert-layout-patch";

describe("revertAgentTaskLayoutPatches", () => {
  it("restores revertSpec from layout artifacts on reject", async () => {
    const previousSpec = {
      root: "intro",
      elements: { intro: { type: "TextBase", props: { content: "Before" } } },
    };
    const nextSpec = {
      root: "intro",
      elements: { intro: { type: "TextBase", props: { content: "After" } } },
    };

    const applySpec = vi.fn().mockResolvedValue(nextSpec);
    const flushPersist = vi.fn().mockResolvedValue(undefined);
    const syncFromDatabase = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();

    const reverted = await revertAgentTaskLayoutPatches(
      "org-1",
      {
        output: {
          summary: "Done",
          steps: [],
          artifacts: [
            {
              kind: "layout",
              documentId: "layout-1",
              label: "home",
              revertSpec: previousSpec,
              liveEditorPatch: true,
            },
          ],
          stoppedReason: "completed",
        },
      },
      {
        layout: { update, get: vi.fn() },
        layoutCollabRooms: { applySpec, flushPersist, syncFromDatabase },
      },
    );

    expect(reverted).toEqual([{ layoutDocumentId: "layout-1", spec: previousSpec, label: "home" }]);
    expect(applySpec).toHaveBeenCalledWith("org-1", "layout-1", previousSpec);
    expect(flushPersist).toHaveBeenCalledWith("org-1", "layout-1");
    expect(syncFromDatabase).toHaveBeenCalledWith("org-1", "layout-1");
    expect(update).not.toHaveBeenCalled();
  });
});
