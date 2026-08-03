import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  type FolderCatalogEntry,
  flattenFoldersForSelect,
  indentFolderLabel,
} from "../../folder-tree";

export function ContentFolderNav({
  folders,
  selectedFolderId,
  onSelectFolder,
}: {
  folders: FolderCatalogEntry[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
}) {
  const options = flattenFoldersForSelect(folders);

  return (
    <Card className="shrink-0 lg:w-48">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Folders</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 p-2 pt-0">
        <Button
          type="button"
          variant={selectedFolderId === null ? "secondary" : "ghost"}
          size="sm"
          className="justify-start"
          onClick={() => onSelectFolder(null)}
        >
          All
        </Button>
        {options.map((folder) => (
          <Button
            key={folder.id}
            type="button"
            variant={selectedFolderId === folder.id ? "secondary" : "ghost"}
            size="sm"
            className="justify-start font-normal"
            onClick={() => onSelectFolder(folder.id)}
          >
            {indentFolderLabel(folder.label, folder.depth)}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
