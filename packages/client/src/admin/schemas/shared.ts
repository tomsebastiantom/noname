import { z } from "zod";

export const adminNavItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string(),
});

export const adminLinkSchema = z.object({
  href: z.string(),
  label: z.string(),
  description: z.string(),
});

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

export const adminShellNavSchema = z.object({
  sidebarTitle: z.string(),
  productName: z.string(),
  navItems: z.array(adminNavItemSchema),
  settingsSectionLabel: z.string(),
  settingsItems: z.array(adminNavItemSchema),
  accountSecurityLabel: z.string(),
  accountSecurityHref: z.string(),
  storefrontLabel: z.string(),
  storefrontHref: z.string(),
  signOutLabel: z.string(),
  signInLabel: z.string(),
});
