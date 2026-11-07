import type { ComponentRegistry, ComponentRenderer } from "@json-render/react";

/**
 * Renderer contract: every block rendered from a spec carries its identity in the DOM.
 *
 * `B1.structure` compares the spec's element counts with the DOM, which is only possible if the DOM says which
 * block is which. The wrapper uses `display: contents` so it does not add a layout box — grid/flex children
 * keep the parent they had — while still emitting the attributes.
 *
 * This is deliberately applied at the registry boundary (one place) rather than inside every component.
 */
export function withBlockMarkers(registry: ComponentRegistry): ComponentRegistry {
  const marked: ComponentRegistry = {};

  for (const [type, Component] of Object.entries(registry)) {
    const Marked: ComponentRenderer = (props) => (
      <div style={{ display: "contents" }} data-block-type={type}>
        <Component {...props} />
      </div>
    );
    marked[type] = Marked;
  }

  return marked;
}
