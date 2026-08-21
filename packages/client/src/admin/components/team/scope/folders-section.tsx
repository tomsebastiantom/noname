import type { ScopeCatalogEntry } from "../../../../auth/document-scope";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import type { FolderSelectOption } from "../../../folder-tree";
import { indentFolderLabel } from "../../../folder-tree";
import type { ScopeAdminLabels } from "./labels";

export function FoldersSection({
  labels,
  pending,
  uniqueCollections,
  folderOptions,
  newFolderSlug,
  onNewFolderSlugChange,
  newFolderParentId,
  onNewFolderParentIdChange,
  onCreateFolder,
  onDeleteFolder,
}: Readonly<{
  labels: ScopeAdminLabels;
  pending: boolean;
  uniqueCollections: ScopeCatalogEntry[];
  folderOptions: FolderSelectOption[];
  newFolderSlug: string;
  onNewFolderSlugChange: (value: string) => void;
  newFolderParentId: string;
  onNewFolderParentIdChange: (value: string) => void;
  onCreateFolder: () => void;
  onDeleteFolder: (slug: string) => void;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.foldersSectionTitle}</CardTitle>
        <CardDescription>{labels.foldersSectionHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scope-new-folder">{labels.folderLabel}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="scope-new-folder"
              value={newFolderSlug}
              onChange={(e) => onNewFolderSlugChange(e.target.value)}
              placeholder={labels.folderPlaceholder}
            />
            <select
              id="scope-new-folder-parent"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={newFolderParentId}
              onChange={(e) => onNewFolderParentIdChange(e.target.value)}
              aria-label="Parent folder"
            >
              <option value="">Top-level folder</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {indentFolderLabel(folder.label, folder.depth)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={pending || !newFolderSlug.trim()}
              onClick={onCreateFolder}
            >
              {pending ? labels.creatingFolderLabel : labels.createFolderLabel}
            </Button>
          </div>
        </div>
        {uniqueCollections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.emptyFoldersMessage}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {folderOptions.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2">
                <span>{indentFolderLabel(entry.label, entry.depth)}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    const slug = uniqueCollections.find((c) => c.id === entry.id)?.slug;
                    if (slug) onDeleteFolder(slug);
                  }}
                >
                  {pending ? labels.deletingLabel : labels.deleteFolderLabel}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
