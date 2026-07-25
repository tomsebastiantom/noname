import { type StateModel, resolveElementProps } from "@json-render/core";

interface SpecElement {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
}

interface JsonRenderSpec {
  root: string;
  elements: Record<string, SpecElement>;
}

/** Walk a json-render spec and resolve `{ "$state": "..." }` props using the content model. */
export function resolveSpecWithState(
  spec: Record<string, unknown>,
  stateModel: StateModel,
): Record<string, unknown> {
  const root = spec.root;
  const elements = spec.elements;
  if (typeof root !== "string" || !elements || typeof elements !== "object" || Array.isArray(elements)) {
    return spec;
  }

  const ctx = { stateModel };
  const resolvedElements: Record<string, SpecElement> = {};

  for (const [key, element] of Object.entries(elements as Record<string, SpecElement>)) {
    const props = element.props;
    resolvedElements[key] = {
      ...element,
      props:
        props && typeof props === "object" && !Array.isArray(props)
          ? resolveElementProps(props, ctx)
          : props,
    };
  }

  return { ...spec, elements: resolvedElements };
}

/** Parse `product:uuid` into type + document id. */
export function parseContentRef(contentRef: string): { type: string; id: string } | null {
  const trimmed = contentRef.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0 || colon === trimmed.length - 1) return null;
  const type = trimmed.slice(0, colon);
  const id = trimmed.slice(colon + 1);
  if (!type || !id) return null;
  return { type, id };
}
