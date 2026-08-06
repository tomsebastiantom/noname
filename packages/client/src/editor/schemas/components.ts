import { z } from "zod";
import { catalogProps, mediaFieldLabelsSchema } from "../../schemas/shared";

const editorShellChromeLabels = {
  title: z.string().min(1),
  exitEditLabel: z.string().min(1),
  discardLabel: z.string().min(1),
  unsavedLabel: z.string().min(1),
  draftSavedLabel: z.string().min(1),
  publishedLabel: z.string().min(1),
  lastEditTemplate: z.string().min(1),
  lastPublishTemplate: z.string().min(1),
  lastEditYouLabel: z.string().min(1),
  lastEditAgentLabel: z.string().min(1),
  lastEditSomeoneLabel: z.string().min(1),
  saveLabel: z.string().min(1),
  savingLabel: z.string().min(1),
  publishLabel: z.string().min(1),
  publishingLabel: z.string().min(1),
  publishAdminOnlyHint: z.string().min(1),
  chromeRailTitle: z.string().min(1),
  hideToolbarLabel: z.string().min(1),
  saveHelpText: z.string().min(1),
  pendingBlockHelpText: z.string().min(1),
  layoutBadgeLabel: z.string().min(1),
  contentBadgeLabel: z.string().min(1),
  scopeLayoutTitle: z.string().min(1),
  scopeLayoutBody: z.string().min(1),
  scopeContentTitle: z.string().min(1),
  scopeContentBody: z.string().min(1),
  scopeNoContentBody: z.string().min(1),
  propsSelectBlockHint: z.string().min(1),
  propsElementMissing: z.string().min(1),
  propsNoFieldsHint: z.string().min(1),
  propsPendingHint: z.string().min(1),
  propsSaveToPageLabel: z.string().min(1),
  propsSavingLabel: z.string().min(1),
  propsSaveToPageHelp: z.string().min(1),
  propsCancelLabel: z.string().min(1),
  propsDuplicateLabel: z.string().min(1),
  propsRemoveLabel: z.string().min(1),
  propsRemoveHelp: z.string().min(1),
  propsNoContentRef: z.string().min(1),
  propsLoadingContent: z.string().min(1),
  propsFieldSaveHint: z.string().min(1),
  blocksPanelTitle: z.string().min(1),
  layersPanelTitle: z.string().min(1),
  propertiesPanelTitle: z.string().min(1),
  hideLayersLabel: z.string().min(1),
  showLayersLabel: z.string().min(1),
  hideBlocksLabel: z.string().min(1),
  layerTreePendingBadge: z.string().min(1),
  layerTreeDragTemplate: z.string().min(1),
  layerTreeExpandTemplate: z.string().min(1),
  layerTreeCollapseTemplate: z.string().min(1),
  loadingLayoutHint: z.string().min(1),
  loadingEditorHint: z.string().min(1),
  labelsMissingHint: z.string().min(1),
  closePanelLabel: z.string().min(1),
  leftPanelsAriaLabel: z.string().min(1),
  rightPanelsAriaLabel: z.string().min(1),
  resizePanelAriaLabel: z.string().min(1),
  chromeRailAriaLabel: z.string().min(1),
  chromeRailSaveErrorTitle: z.string().min(1),
  publishPermissionTitle: z.string().min(1),
  propsBlockSuffix: z.string().min(1),
  paletteCatalogSuffix: z.string().min(1),
  palettePinnedAriaLabel: z.string().min(1),
  palettePinnedTitle: z.string().min(1),
  palettePinnedEmpty: z.string().min(1),
  palettePinsLoading: z.string().min(1),
  paletteAllBlocksTitle: z.string().min(1),
  paletteFilterPlaceholder: z.string().min(1),
  paletteFilterAriaLabel: z.string().min(1),
  paletteNoMatchPrefix: z.string().min(1),
  paletteAllPinnedHint: z.string().min(1),
  paletteUnpinLabel: z.string().min(1),
  paletteDragToAddHint: z.string().min(1),
  palettePinOnlyHint: z.string().min(1),
  layerTreeAriaLabel: z.string().min(1),
  layerTreeHint: z.string().min(1),
  layerTreeEmpty: z.string().min(1),
  layerTreeRootMissing: z.string().min(1),
  layerTreeExpandedTitle: z.string().min(1),
  layerTreeCollapsedTitle: z.string().min(1),
  canvasAriaLabel: z.string().min(1),
  canvasBlockFallbackLabel: z.string().min(1),
  dropInsideEmptyTemplate: z.string().min(1),
  dropAtTopTemplate: z.string().min(1),
  dropAtBottomTemplate: z.string().min(1),
  dropAtSlotTemplate: z.string().min(1),
  saveConflictMessage: z.string().min(1),
  refreshLayoutLabel: z.string().min(1),
  previewBarAriaLabel: z.string().min(1),
  previewFullLabel: z.string().min(1),
  previewTabletLabel: z.string().min(1),
  previewMobileLabel: z.string().min(1),
  actionNoneLabel: z.string().min(1),
};

const editorShellLabelsShape = {
  ...editorShellChromeLabels,
  ...mediaFieldLabelsSchema.shape,
};

export const editorShellLabelsSchema = z.object(editorShellLabelsShape);
export type EditorShellLabels = z.infer<typeof editorShellLabelsSchema>;

export const VISUAL_EDITOR_LAYOUT_TEMPLATE = "visual_editor";

const editorShellConfig = {
  templateName: z.string(),
  pageContentRef: z.string().nullable(),
};

/**
 * Spec-driven visual editor shell — palette / canvas / props panel slots.
 * Host wiring today: lazy `EditPageView` in main.tsx; registry ready for layout spec.
 */
export const editorComponentSchemas = {
  VisualEditorShell: {
    props: catalogProps(editorShellLabelsShape, editorShellConfig),
    slots: ["palette", "layers", "canvas", "panel"],
    description: "Storefront page visual editor chrome with four zones",
  },
  EditorPalette: {
    props: catalogProps({}, {}),
    description: "Catalog block palette (session-backed slot)",
  },
  EditorLayerTree: {
    props: catalogProps({}, {}),
    description: "Layout layer tree (session-backed slot)",
  },
  EditorCanvas: {
    props: catalogProps({}, {}),
    description: "Live page canvas (session-backed slot)",
  },
  EditorPropsPanel: {
    props: catalogProps({}, {}),
    description: "Block properties panel (session-backed slot)",
  },
};
