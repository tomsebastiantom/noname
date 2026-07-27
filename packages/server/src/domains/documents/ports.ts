// Unified documents domain ports.
//
// `content`, `content_type`, `tenant_settings`, `layout`, `asset`, `page`,
// `page_tree` are separate document-TYPES. They keep SEPARATE TypeScript
// DTOs/ports, separate versions, separate statuses, and separate event names —
// only the storage table is shared. A generic `DocumentStorage` implements every
// type behind one interface so the shared machinery lives once.

// ---------------------------------------------------------------------------
// Document envelope — shared by every type.
// ---------------------------------------------------------------------------

export type DocumentType =
  | "content"
  | "content_type"
  | "page"
  | "page_tree"
  | "tenant_settings"
  | "asset"
  | "layout"
  | "backend-logic";

export type DocumentStatus = "draft" | "published" | "archived";

export interface DocumentDTO {
  id: string;
  orgId: string;
  type: string;
  key: string;
  version: number;
  segment: string;
  status: DocumentStatus;
  // Layout variant lineage (version of default this overrides was based on).
  // Null for content / layout default.
  baseVersion: number | null;
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentEntryDTO = DocumentDTO;

// ---------------------------------------------------------------------------
// CONTENT TYPE SCHEMA — schema-first content modeling.
// ---------------------------------------------------------------------------

export type FieldType =
  | "text"
  | "longText"
  | "richText"
  | "number"
  | "boolean"
  | "date"
  | "media"
  | "mediaList"
  | "reference"
  | "array"
  | "json"
  | "enum";

export interface FieldDefinition {
  key: string;
  type: FieldType;
  required: boolean;
  // Per-field locale flag. When true the field's value is a locale-keyed map
  // ({ "en-US": ..., "fr": ... }); when false it is a plain shared value.
  isLocalizable: boolean;
  label: string;
  constraints?: Record<string, unknown>;
  items?: { type: FieldType };
  options?: string[];
  references?: string;
  permissions?: { read: string[]; write: string[] };
}

export interface ContentTypeSchema {
  fields: FieldDefinition[];
}

export interface ContentTypeDTO {
  id: string;
  orgId: string;
  name: string;
  schema: ContentTypeSchema;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// TENANT SETTINGS — per-tenant locale + SEO + integrations config.
// ---------------------------------------------------------------------------

import type { ContentEntryRef, MediaRef } from "./refs";

export type { ContentEntryRef, MediaRef };

export interface TenantSeoConfig {
  metaTitleTemplate?: string;
  metaDescription?: string;
  ogImage?: MediaRef;
  twitterCard?: string;
  canonicalDomain?: string;
}

export interface TenantIntegrations {
  googleAnalyticsId?: string | null;
  facebookPixelId?: string | null;
  hotjarId?: string | null;
  tiktokPixelId?: string | null;
  [key: string]: string | null | undefined;
}

export type TeamMemberRole = "admin" | "editor";

export interface TenantAuthConfig {
  providers: string[];
  idpIds: Record<string, string>;
  allowPassword: boolean;
  allowSignUp?: boolean;
  allowPasswordReset?: boolean;
  requireMfaForAdmin?: boolean;
  providerLabels?: Record<string, string>;
  /** Media refs — same shape as content `icon` / SEO `ogImage` fields. URLs resolved at read time. */
  providerIconAssets?: Record<string, MediaRef>;
}

export interface TenantSettingsDTO {
  id: string;
  orgId: string;
  slug: string | null;
  locales: string[];
  defaultLocale: string;
  seo: TenantSeoConfig;
  integrations: TenantIntegrations;
  auth: TenantAuthConfig;
}

// ---------------------------------------------------------------------------
// CONTENT type — authored business data.
// ---------------------------------------------------------------------------

export interface ContentValidator {
  validate(
    schema: ContentTypeSchema | null,
    data: unknown,
    tenantLocales: string[],
    targetLocale?: string,
  ): { valid: boolean; errors?: string[] };
}

// ---------------------------------------------------------------------------
// LAYOUT type — json-render templates with per-segment variants.
// ---------------------------------------------------------------------------

export type LayoutStatus = "draft" | "published" | "archived";

export interface LayoutFilters {
  templateName?: string;
  segment?: string;
  status?: LayoutStatus;
}

export interface LayoutDTO extends DocumentDTO {
  type: "layout";
}

export interface CreateLayoutInput {
  templateName: string;
  segment?: string;
  // default segment -> full spec; non-default -> override map.
  spec: Record<string, unknown>;
  baseVersion?: number | null;
}

export interface UpdateLayoutInput {
  spec: Record<string, unknown>;
  contentRef?: string | null;
}

export interface ResolvedLayout {
  templateName: string;
  segment: string;
  version: number;
  spec: Record<string, unknown>;
  contentRef: string | null;
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// ASSET type — media metadata (binary lives in R2).
// ---------------------------------------------------------------------------

export interface AssetVariant {
  url: string;
  width: number | null;
  height: number | null;
  format?: string;
}

export interface AssetDTO extends DocumentDTO {
  type: "asset";
}

export interface UploadAssetInput {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  // Binary storage key (where the bytes live, e.g. R2 object key).
  storageKey: string;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
  caption?: string | null;
  focalPoint?: { x: number; y: number } | null;
  variants?: Record<string, AssetVariant>;
  hash?: string;
}

// ---------------------------------------------------------------------------
// PAGE / PAGE_TREE types — routing layer.
// ---------------------------------------------------------------------------

export interface PageTreePageRef {
  id: string;
  slug: Record<string, string>;
  pageId: string;
}

export interface PageTreeDTO extends DocumentDTO {
  type: "page_tree";
}

export interface PageDTO extends DocumentDTO {
  type: "page";
}

export interface ResolvedRoute {
  pageId: string;
  layoutRef: string;
  contentRef: string;
  locale: string;
}

// ---------------------------------------------------------------------------
// Unified storage (type registry).
// ---------------------------------------------------------------------------

export interface DocumentFilters {
  type?: string;
  segment?: string;
  status?: DocumentStatus;
  key?: string;
}

export interface CreateDocumentInput {
  orgId: string;
  type: string;
  key: string;
  data: Record<string, unknown>;
  segment?: string;
  status?: DocumentStatus;
  baseVersion?: number | null;
  meta?: Record<string, unknown>;
}

export interface DocumentStorage {
  // content type schema registry
  createContentType(
    orgId: string,
    name: string,
    schema: ContentTypeSchema,
  ): Promise<ContentTypeDTO>;
  findContentTypes(orgId: string): Promise<ContentTypeDTO[]>;
  findContentTypeByName(orgId: string, name: string): Promise<ContentTypeDTO | null>;
  updateContentType(
    orgId: string,
    name: string,
    schema: ContentTypeSchema,
  ): Promise<ContentTypeDTO>;

  // tenant settings
  getTenantSettings(orgId: string): Promise<TenantSettingsDTO | null>;
  findOrgIdByStoreSlug(slug: string): Promise<string | null>;
  upsertTenantSettings(
    orgId: string,
    data: Omit<TenantSettingsDTO, "id" | "orgId">,
  ): Promise<TenantSettingsDTO>;

  // generic document CRUD (unified table)
  createDocument(input: CreateDocumentInput): Promise<DocumentDTO>;
  listDocuments(orgId: string, filters?: DocumentFilters): Promise<DocumentDTO[]>;
  findDocument(
    orgId: string,
    type: string,
    key: string,
    segment?: string,
  ): Promise<DocumentDTO | null>;
  findDocumentById(id: string): Promise<DocumentDTO | null>;
  updateDocument(
    id: string,
    data: Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): Promise<DocumentDTO>;
  publishDocument(id: string): Promise<DocumentDTO>;
  archiveDocument(id: string): Promise<DocumentDTO>;
  deleteDocument(id: string): Promise<void>;
  findAssetByHash(orgId: string, hash: string): Promise<DocumentDTO | null>;
  findDocumentsWithDataMentioning(orgId: string, needle: string): Promise<DocumentDTO[]>;
}

// ---------------------------------------------------------------------------
// Service interfaces.
// ---------------------------------------------------------------------------

export interface ContentTypeDocumentService {
  create(orgId: string, name: string, schema: ContentTypeSchema): Promise<ContentTypeDTO>;
  list(orgId: string): Promise<ContentTypeDTO[]>;
  get(orgId: string, name: string): Promise<ContentTypeDTO | null>;
  update(orgId: string, name: string, schema: ContentTypeSchema): Promise<ContentTypeDTO>;
}

export interface TenantSettingsService {
  get(orgId: string): Promise<TenantSettingsDTO>;
  upsert(orgId: string, data: Omit<TenantSettingsDTO, "id" | "orgId">): Promise<TenantSettingsDTO>;
  resolveStoreSlug(slug: string): Promise<string | null>;
}

export interface ContentContentOpts {
  locale?: string;
  role?: string;
}

export interface ContentDocumentService {
  create(
    orgId: string,
    type: string,
    data: Record<string, unknown>,
    opts?: ContentContentOpts,
  ): Promise<ContentEntryDTO>;
  findByType(orgId: string, type: string): Promise<ContentEntryDTO[]>;
  findById(orgId: string, id: string, opts?: ContentContentOpts): Promise<ContentEntryDTO | null>;
  updateById(
    orgId: string,
    type: string,
    id: string,
    data: Record<string, unknown>,
    opts?: ContentContentOpts,
  ): Promise<ContentEntryDTO>;
  deleteById(orgId: string, type: string, id: string): Promise<void>;
  publish(orgId: string, type: string, id: string): Promise<ContentEntryDTO>;
  resolve(
    orgId: string,
    type: string,
    id: string,
    locale: string,
  ): Promise<Record<string, unknown> | null>;
}

export interface LayoutDocumentService {
  create(orgId: string, input: CreateLayoutInput): Promise<LayoutDTO>;
  update(orgId: string, id: string, input: UpdateLayoutInput): Promise<LayoutDTO>;
  addVariant(
    orgId: string,
    templateName: string,
    segment: string,
    overrides: Record<string, unknown>,
  ): Promise<LayoutDTO>;
  publish(orgId: string, id: string): Promise<LayoutDTO>;
  archive(orgId: string, id: string): Promise<LayoutDTO>;
  list(
    orgId: string,
    filters?: { templateName?: string; segment?: string; status?: LayoutStatus },
  ): Promise<LayoutDTO[]>;
  get(orgId: string, id: string): Promise<LayoutDTO | null>;
  resolve(orgId: string, templateName: string, segment: string): Promise<ResolvedLayout | null>;
}

export interface AssetDocumentService {
  create(orgId: string, input: UploadAssetInput): Promise<AssetDTO>;
  get(orgId: string, assetId: string): Promise<AssetDTO | null>;
  list(orgId: string): Promise<AssetDTO[]>;
  update(orgId: string, assetId: string, data: Partial<UploadAssetInput>): Promise<AssetDTO>;
  archive(orgId: string, assetId: string): Promise<AssetDTO>;
  delete(orgId: string, assetId: string): Promise<void>;
  publish(orgId: string, assetId: string): Promise<AssetDTO>;
  findByHash(orgId: string, hash: string): Promise<AssetDTO | null>;
}

export interface UpsertPageInput {
  layoutRef: string;
  contentRef?: string | null;
}

export interface MainTreeView {
  id: string;
  status: string;
  pages: PageTreePageRef[];
}

export interface RoutingPageView {
  id: string;
  key: string;
  status: string;
  layoutRef: string;
  contentRef: string;
}

export interface PageTreeService {
  resolveByUrl(orgId: string, url: string, locale: string): Promise<ResolvedRoute | null>;
  getMainTree(orgId: string): Promise<MainTreeView | null>;
  listRoutingPages(orgId: string): Promise<RoutingPageView[]>;
  getRoutingPage(orgId: string, pageKey: string): Promise<RoutingPageView | null>;
  upsertMainTree(orgId: string, pages: PageTreePageRef[]): Promise<PageTreeDTO>;
  upsertPage(orgId: string, pageKey: string, input: UpsertPageInput): Promise<PageDTO>;
}

import type { InboundRefHit } from "./find-inbound-refs";
import type { ResolvedDocumentRef } from "./resolve-refs";

export interface DocumentService {
  contentTypes: ContentTypeDocumentService;
  tenantSettings: TenantSettingsService;
  content: ContentDocumentService;
  layout: LayoutDocumentService;
  assets: AssetDocumentService;
  pages: PageTreeService;
  resolveRefs(
    orgId: string,
    ids: string[],
    locale?: string,
  ): Promise<Record<string, ResolvedDocumentRef | null>>;
  findInboundRefs(orgId: string, documentId: string): Promise<InboundRefHit[]>;
}
