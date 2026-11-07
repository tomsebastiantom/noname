import { z } from "zod";

/** Layout spec props — flat props only (all copy and behavior at the top level). See skills/spec-driven-ui/props-contract.md */
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

export const documentFolderLabelsSchema = z.object({
  folderLabel: z.string(),
  folderPlaceholder: z.string(),
  folderHint: z.string(),
  folderNoneLabel: z.string(),
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

export const documentPublisherShareLabelsSchema = z.object({
  publisherShareTitle: z.string(),
  publisherShareHint: z.string(),
  publisherShareUserLabel: z.string(),
  publisherShareGrantLabel: z.string(),
  publisherShareGrantingLabel: z.string(),
  publisherShareRevokeLabel: z.string(),
  publisherShareRevokingLabel: z.string(),
  publisherShareGrantSuccessMessage: z.string(),
  publisherShareRevokeSuccessMessage: z.string(),
  publisherShareEmptyMessage: z.string(),
  publisherShareLoadingLabel: z.string(),
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
