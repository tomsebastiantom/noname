import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { DataTable } from "../shared/DataTable";

export function ContentEntryTypeList({
  title,
  description,
  types,
}: {
  title: string;
  description: string | null;
  types: { name: string; fieldCount: number }[];
}) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <DataTable
          rows={types}
          rowKey={(t) => t.name}
          onRowClick={(t) => {
            window.location.href = `/admin/content/${t.name}`;
          }}
          emptyMessage="No content types yet. Register one via POST /api/documents/content-types."
          columns={[
            {
              key: "name",
              header: "Type",
              cell: (t) => <span className="font-medium">{t.name}</span>,
            },
            {
              key: "fields",
              header: "Fields",
              cell: (t) => <span className="text-muted-foreground">{t.fieldCount}</span>,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
