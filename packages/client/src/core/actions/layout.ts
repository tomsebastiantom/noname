import {
  parseSpecJson,
  publishLayout,
  saveLayout,
} from "../../admin/layout-entries";

export const layoutActions = {
  saveLayoutEntry: async (params: unknown) => {
    const { id, specJson, contentRef } = params as {
      id: string;
      specJson: string;
      contentRef?: string | null;
    };
    const spec = parseSpecJson(specJson);
    await saveLayout({ id, spec, contentRef });
  },

  publishLayoutEntry: async (params: unknown) => {
    const { id } = params as { id: string };
    await publishLayout(id);
  },
};
