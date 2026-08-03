import { z } from "zod";

/** Layout spec props — config (behavior) + labels (all copy). See skills/spec-driven-ui/props-contract.md */
export function catalogProps<TLabels extends z.ZodRawShape, TConfig extends z.ZodRawShape>(
  labels: TLabels,
  config: TConfig,
) {
  return z.object({
    config: z.object(config),
    labels: z.object(labels),
  });
}

export type CatalogProps<
  TConfig extends Record<string, unknown>,
  TLabels extends Record<string, unknown>,
> = {
  config: TConfig;
  labels: TLabels;
};

export const draftPublishLabelsSchema = z.object({
  saveLabel: z.string(),
  savingLabel: z.string(),
  publishLabel: z.string(),
  publishingLabel: z.string(),
});

export const mediaFieldLabelsSchema = z.object({
  uploadFileLabel: z.string(),
  uploadingLabel: z.string(),
  pickExistingLabel: z.string(),
  loadingAssetsLabel: z.string(),
  clearLabel: z.string(),
});

export const referenceFieldLabelsSchema = z.object({
  entriesLoadingLabel: z.string(),
  emptyLabel: z.string(),
  selectedPrefix: z.string(),
  clearLabel: z.string(),
  missingTargetMessage: z.string(),
});

export const documentTagsLabelsSchema = z.object({
  tagsLabel: z.string(),
  tagsPlaceholder: z.string(),
  tagsHint: z.string(),
});

export const documentShareLabelsSchema = z.object({
  shareTitle: z.string(),
  shareHint: z.string(),
  shareUserLabel: z.string(),
  shareGrantLabel: z.string(),
  shareGrantingLabel: z.string(),
  shareRevokeLabel: z.string(),
  shareRevokingLabel: z.string(),
  shareGrantSuccessMessage: z.string(),
  shareRevokeSuccessMessage: z.string(),
  shareEmptyMessage: z.string(),
  shareLoadingLabel: z.string(),
});

/** Nav row structure — display name in labels.nav[id] */
export const navItemConfigSchema = z.object({
  id: z.string(),
  href: z.string(),
});

export const adminLinkConfigSchema = z.object({
  id: z.string(),
  href: z.string(),
});
