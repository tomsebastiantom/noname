import { parseSpecJson, publishLayout, saveLayout } from "../../admin/layout-entries";
import type { CatalogActionHandler } from "./types";

export const layoutActions = {
  saveLayoutEntry: (async (params) => {
    const { id, specJson, contentRef } = params as {
      id: string;
      specJson: string;
      contentRef?: string | null;
    };
    const spec = parseSpecJson(specJson);
    await saveLayout({ id, spec, contentRef });
  }) satisfies CatalogActionHandler,

  publishLayoutEntry: (async (params) => {
    const { id } = params as { id: string };
    await publishLayout(id);
  }) satisfies CatalogActionHandler,
};
