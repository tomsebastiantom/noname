import type { z } from "zod";
import { adminComponentSchemas } from "./admin-components";
import { commerceComponentSchemas } from "./commerce";
import { coreComponentSchemas } from "./core";
import { editorComponentSchemas } from "./editor-components";

/**
 * The platform catalog — the single node-safe definition of what a block is.
 *
 * The client needs these schemas to render and validate edits; the bundler needs them to compile a tenant
 * catalog; the eval service needs them to answer “is this block type and these props legal?”. Keeping one copy
 * here means the answer cannot differ between those consumers.
 *
 * React-free on purpose: importing a component implementation to learn its prop schema would drag the UI
 * runtime into a Node process.
 */

export * from "./admin-actions";
export * from "./admin-components";
export * from "./admin-shared";
export * from "./commerce";
export * from "./core";
export * from "./editor-actions";
export * from "./editor-components";
export * from "./login-form-labels";
export * from "./shared";

/** Every catalog component the platform ships (core + commerce extension + admin/editor shells). */
export const catalogComponentSchemas = {
  ...coreComponentSchemas,
  ...commerceComponentSchemas,
  ...adminComponentSchemas,
  ...editorComponentSchemas,
};

export type CatalogComponentType = keyof typeof catalogComponentSchemas;

export function catalogComponentTypes(): string[] {
  return Object.keys(catalogComponentSchemas).sort();
}

export function catalogHasType(type: string): boolean {
  return Boolean((catalogComponentSchemas as Record<string, unknown>)[type]);
}

type ElementLike = {
  type?: unknown;
  props?: unknown;
};

export type CatalogValidation = { ok: true } | { ok: false; reason: string };

/**
 * json-render expressions (`$state`, `$item`, `$computed`, `$bindState`, `$cond`, …) are resolved at render
 * time against tenant content. A stored layout therefore carries placeholders where a string/number would
 * otherwise be, so prop validation is deferred for those elements — the rendered check is what proves the
 * resolved value. Type validation is still exact.
 */
function hasDynamicBinding(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDynamicBinding);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => key.startsWith("$"))) return true;
    return Object.values(record).some(hasDynamicBinding);
  }
  return false;
}

/**
 * Validate one spec element against the catalog.
 *
 * The check is deliberately narrow: the type must exist and, when the props are static, they must satisfy the
 * schema. Unknown extra props are stripped by Zod’s default object behaviour, which matches how the renderer
 * treats them — a prop the catalog does not declare cannot affect rendering.
 */
export function validateCatalogElement(element: ElementLike): CatalogValidation {
  const type = typeof element.type === "string" ? element.type.trim() : "";
  if (!type) return { ok: false, reason: "element has no block type" };

  const definition = (catalogComponentSchemas as Record<string, { props: z.ZodTypeAny }>)[type];
  if (!definition) return { ok: false, reason: `unknown block type "${type}"` };

  if (hasDynamicBinding(element.props)) return { ok: true };

  const parsed = definition.props.safeParse(element.props ?? {});
  if (parsed.success) return { ok: true };

  const issues = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return { ok: false, reason: `invalid props for "${type}": ${issues}` };
}
