export interface ContentStorage {
  create(tenantId: string, type: string, slug: string, data: unknown): Promise<unknown>;
  findByType(tenantId: string, type: string): Promise<unknown[]>;
  findBySlug(tenantId: string, type: string, slug: string): Promise<unknown | null>;
  update(tenantId: string, type: string, slug: string, data: unknown): Promise<unknown>;
  delete(tenantId: string, type: string, slug: string): Promise<void>;
}
export interface ContentValidator {
  validate(type: string, data: unknown): Promise<boolean>;
}
