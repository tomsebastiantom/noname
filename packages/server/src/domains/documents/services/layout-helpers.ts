import { ValidationError } from "../../../shared/domain-error";
import { LayoutDocument } from "../entity";
import type { LayoutDTO } from "../ports";

export function validateTemplateName(name: string): void {
  if (!name || !/^[a-z0-9_-]+$/.test(name)) {
    throw new ValidationError(
      "templateName",
      "templateName must be lowercase, alphanumeric, dash, or underscore",
    );
  }
}

export function validateSpec(spec: Record<string, unknown>): void {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new ValidationError("spec", "spec must be an object");
  }
}

export function readContentRef(data: Record<string, unknown>): string | null {
  const ref = data.contentRef;
  return typeof ref === "string" && ref.trim() !== "" ? ref : null;
}

export function toLayoutEntity(dto: LayoutDTO): LayoutDocument {
  return new LayoutDocument(
    dto.id,
    dto.orgId,
    dto.key,
    dto.version,
    dto.segment,
    (dto.data.spec as Record<string, unknown>) ?? {},
    dto.status,
    dto.baseVersion,
    dto.createdAt,
    dto.updatedAt,
  );
}
