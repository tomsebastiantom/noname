import { useEffect, useState } from "react";
import { fetchScopeCollections } from "../../../auth/document-scope";
import { Label } from "../../../components/ui/label";
import { flattenFoldersForSelect, indentFolderLabel } from "../../folder-tree";

export type DocumentFolderFieldLabels = {
  folderLabel: string;
  folderPlaceholder: string;
  folderHint: string;
  folderNoneLabel: string;
};

export function DocumentFolderField({
  id,
  value,
  onChange,
  labels,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  labels: DocumentFolderFieldLabels;
}) {
  const [folders, setFolders] = useState<{ id: string; label: string; depth: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchScopeCollections()
      .then((entries) => {
        if (!cancelled) {
          const catalog = entries
            .filter((entry): entry is typeof entry & { id: string } => Boolean(entry.id))
            .map((entry) => ({
              id: entry.id,
              slug: entry.slug,
              label: entry.label,
              parentId: entry.parentId ?? null,
            }));
          setFolders(flattenFoldersForSelect(catalog));
        }
      })
      .catch(() => {
        if (!cancelled) setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{labels.folderLabel}</Label>
      <select
        id={id}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{labels.folderNoneLabel}</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {indentFolderLabel(folder.label, folder.depth)}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{labels.folderHint}</p>
    </div>
  );
}
