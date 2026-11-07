import { z } from "zod";

/** Catalog actions for the storefront visual editor (layout + page content). */
export const editorActionSchemas = {
  loadEditorLayout: {
    params: z.object({
      templateName: z.string().min(1),
      segment: z.string().optional(),
    }),
    description: "Load layout draft for visual editor",
  },
  saveEditorLayout: {
    params: z.object({
      id: z.string().min(1),
      specJson: z.string().min(2),
      contentRef: z.string().nullable().optional(),
    }),
    description: "Save layout draft from visual editor",
  },
  publishEditorLayout: {
    params: z.object({
      id: z.string().min(1),
    }),
    description: "Publish layout from visual editor",
  },
  loadEditorContent: {
    params: z.object({
      contentRef: z.string().min(1),
      locale: z.string().optional(),
    }),
    description: "Load CMS entry fields for editor props panel",
  },
  saveEditorContent: {
    params: z.object({
      contentType: z.string().min(1),
      id: z.string().min(1),
      schema: z.object({
        fields: z.array(
          z.object({
            key: z.string(),
            type: z.string(),
            required: z.boolean(),
            isLocalizable: z.boolean(),
            label: z.string(),
          }),
        ),
      }),
      values: z.record(z.string(), z.string()),
      locale: z.string().optional(),
    }),
    description: "Save CMS entry draft from visual editor",
  },
  publishEditorContent: {
    params: z.object({
      contentType: z.string().min(1),
      id: z.string().min(1),
    }),
    description: "Publish CMS entry from visual editor",
  },
};
