import { ValidationError } from "../../../shared/domain-error";
import type { ContentTypeSchema } from "../ports";

export function validateContentTypeName(name: string): void {
  if (!name || !/^[a-z0-9_]+$/.test(name)) {
    throw new ValidationError(
      "name",
      "content type name must be lowercase alphanumeric/underscore",
    );
  }
}

export function validateSchema(schema: ContentTypeSchema): void {
  if (!schema || !Array.isArray(schema.fields)) {
    throw new ValidationError("schema", "schema must have a 'fields' array");
  }
  for (const f of schema.fields) {
    if (!f.key || !f.type) {
      throw new ValidationError("schema", "each field needs a key and a type");
    }
    if (f.type === "reference" && !f.references?.trim()) {
      throw new ValidationError(
        "schema",
        `reference field '${f.key}' must declare references (target content type)`,
      );
    }
  }
}
