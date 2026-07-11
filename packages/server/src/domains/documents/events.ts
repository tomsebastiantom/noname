// Event name constants for cross-domain use.
// content.*, layout.*, asset.*, page.*, page_tree.*, tenant_settings.*,
// content_type.* are SEPARATE namespaces — never shared — so each document-type
// evolves and invalidates its own cache independently.

export const ContentEvents = {
  CREATED: "content.created",
  UPDATED: "content.updated",
  DELETED: "content.deleted",
  PUBLISHED: "content.published",
} as const;

export const ContentTypeEvents = {
  CREATED: "content_type.created",
  UPDATED: "content_type.updated",
} as const;

export const TenantSettingsEvents = {
  UPDATED: "tenant_settings.updated",
} as const;

export const LayoutEvents = {
  CREATED: "layout.created",
  UPDATED: "layout.updated",
  PUBLISHED: "layout.published",
  ARCHIVED: "layout.archived",
  VARIANT_CREATED: "layout.variant_created",
} as const;

export const AssetEvents = {
  CREATED: "asset.created",
  UPLOADED: "asset.uploaded",
  PROCESSED: "asset.processed",
  PUBLISHED: "asset.published",
  ARCHIVED: "asset.archived",
} as const;

export const PageEvents = {
  CREATED: "page.created",
  UPDATED: "page.updated",
  PUBLISHED: "page.published",
} as const;

export const PageTreeEvents = {
  CREATED: "page_tree.created",
  UPDATED: "page_tree.updated",
} as const;
