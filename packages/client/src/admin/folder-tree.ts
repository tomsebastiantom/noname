export type FolderCatalogEntry = {
  id: string;
  slug: string;
  label: string;
  parentId: string | null;
};

export type FolderSelectOption = {
  id: string;
  label: string;
  depth: number;
};

/** Folder ids that match the filter (selected folder + all descendants). */
export function folderScopeIds(
  folders: Pick<FolderCatalogEntry, "id" | "parentId">[],
  selectedFolderId: string,
): Set<string> {
  const byParent = new Map<string | null, string[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(folder.id);
    else byParent.set(key, [folder.id]);
  }

  const ids = new Set<string>([selectedFolderId]);
  const queue = [selectedFolderId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const childId of byParent.get(current) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      queue.push(childId);
    }
  }
  return ids;
}

/** Depth-first folder list for indented selects and sidebars. */
export function flattenFoldersForSelect(folders: FolderCatalogEntry[]): FolderSelectOption[] {
  const byParent = new Map<string | null, FolderCatalogEntry[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(folder);
    else byParent.set(key, [folder]);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  const out: FolderSelectOption[] = [];
  function walk(parentId: string | null, depth: number): void {
    for (const folder of byParent.get(parentId) ?? []) {
      out.push({ id: folder.id, label: folder.label, depth });
      walk(folder.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

export function indentFolderLabel(label: string, depth: number): string {
  if (depth <= 0) return label;
  return `${"\u00a0".repeat(depth * 2)}${label}`;
}

/** Avoid redundant "marketing (marketing)" when label matches slug. */
export function formatFolderOptionLabel(label: string, slug: string): string {
  if (label.trim().toLowerCase() === slug.trim().toLowerCase()) return label;
  return `${label} (${slug})`;
}
