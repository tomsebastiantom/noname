import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import type { ContentEntryRow, ContentTypeSchema } from "../../content-entries";
import { entryLabel } from "../../content-entries";
import { DataTable } from "../shared/DataTable";

export function ContentEntryListPanel({
  contentType,
  entries,
  schema,
  locale,
  onSelectEntry,
  onStartNewEntry,
}: {
  contentType: string;
  entries: ContentEntryRow[];
  schema: ContentTypeSchema;
  locale: string;
  onSelectEntry: (id: string) => void;
  onStartNewEntry: () => void;
}) {
  return (
    <Card className="shrink-0 lg:w-64">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{contentType}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={onStartNewEntry}>
          + New
        </Button>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <DataTable
          rows={entries}
          rowKey={(entry) => entry.id}
          onRowClick={(entry) => onSelectEntry(entry.id)}
          emptyMessage="No entries yet."
          columns={[
            {
              key: "label",
              header: "Entry",
              cell: (entry) => entryLabel(entry, schema, locale),
            },
            {
              key: "status",
              header: "Status",
              cell: (entry) => (
                <Badge variant={entry.status === "published" ? "success" : "muted"}>
                  {entry.status}
                </Badge>
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
