import { describe, expect, it } from "vitest";
import { flattenFoldersForSelect, folderScopeIds, formatFolderOptionLabel } from "./folder-tree";

describe("folder-tree", () => {
  const folders = [
    { id: "marketing", slug: "marketing", label: "Marketing", parentId: null },
    { id: "summer", slug: "summer-campaign", label: "Summer campaign", parentId: "marketing" },
    { id: "legal", slug: "legal", label: "Legal", parentId: null },
  ];

  it("collects descendant folder ids", () => {
    const scope = folderScopeIds(folders, "marketing");
    expect([...scope].sort()).toEqual(["marketing", "summer"]);
  });

  it("flattens folders in tree order with depth", () => {
    expect(flattenFoldersForSelect(folders)).toEqual([
      { id: "legal", label: "Legal", depth: 0 },
      { id: "marketing", label: "Marketing", depth: 0 },
      { id: "summer", label: "Summer campaign", depth: 1 },
    ]);
  });

  it("formats folder option without duplicate slug", () => {
    expect(formatFolderOptionLabel("marketing", "marketing")).toBe("marketing");
    expect(formatFolderOptionLabel("Marketing", "marketing")).toBe("Marketing");
    expect(formatFolderOptionLabel("Summer campaign", "summer-campaign")).toBe(
      "Summer campaign (summer-campaign)",
    );
  });
});
