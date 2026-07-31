import type { DocumentDTO } from "../ports";

export interface RoutingPageView {
  id: string;
  key: string;
  status: string;
  layoutRef: string;
  contentRef: string;
}

export function toRoutingPageView(row: DocumentDTO): RoutingPageView {
  return {
    id: row.id,
    key: row.key,
    status: row.status,
    layoutRef: (row.data.layoutRef as string) ?? "",
    contentRef: (row.data.contentRef as string) ?? "",
  };
}
