export interface ContentEntryDTO {
  id: string;
  tenantId: string;
  type: string;
  slug: string;
  data: Record<string, unknown>;
  status: "draft" | "published" | "archived";
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentStorage {
  create(tenantId: string, type: string, slug: string, data: Record<string, unknown>): Promise<ContentEntryDTO>;
  findByType(tenantId: string, type: string): Promise<ContentEntryDTO[]>;
  findBySlug(tenantId: string, type: string, slug: string): Promise<ContentEntryDTO | null>;
  update(tenantId: string, type: string, slug: string, data: Record<string, unknown>): Promise<ContentEntryDTO>;
  delete(tenantId: string, type: string, slug: string): Promise<void>;
}

export interface ContentValidator {
  validate(type: string, data: unknown): Promise<{ valid: boolean; errors?: string[] }>;
}