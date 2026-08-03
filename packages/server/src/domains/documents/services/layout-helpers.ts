import { ValidationError } from "../../../shared/domain-error";
import { LayoutDocument } from "../entity";
import type { LayoutDTO, LayoutRenderAs } from "../ports";

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

export function readRenderAs(data: Record<string, unknown>): LayoutRenderAs {
  const renderAs = data.renderAs;
  if (
    renderAs === "standalone" ||
    renderAs === "shell" ||
    renderAs === "panel" ||
    renderAs === "editor"
  ) {
    return renderAs;
  }
  return "standalone";
}

export function readShellRef(data: Record<string, unknown>): string | null {
  const ref = data.shellRef;
  return typeof ref === "string" && ref.trim() !== "" ? ref.trim() : null;
}

export function validateLayoutMetadata(
  data: Record<string, unknown>,
  options?: { publishing?: boolean },
): void {
  const renderAs = readRenderAs(data);
  const shellRef = readShellRef(data);

  if (renderAs === "panel") {
    if (options?.publishing && !shellRef) {
      throw new ValidationError("shellRef", "panel layouts require shellRef on publish");
    }
    return;
  }

  if (renderAs === "shell" && shellRef) {
    throw new ValidationError("shellRef", "shell layouts must not set shellRef");
  }
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
