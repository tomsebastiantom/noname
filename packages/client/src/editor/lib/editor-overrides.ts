import { ADMIN_PALETTE_EXCLUDED_TYPES } from "./admin-palette-excluded";

/** Not draggable in the storefront visual editor. */
export const PALETTE_EXCLUDED_TYPES = new Set([
  "MountAction",
  "LoginForm",
  "AuthLayout",
  ...ADMIN_PALETTE_EXCLUDED_TYPES,
]);

export type EditorComponentOverride = {
  label?: string;
  preferredParentType?: string;
  /** Layout config keys → CMS state keys for `$state` bindings on new blocks. */
  configStateBindings?: Record<string, string>;
  seedLabels?: Record<string, unknown>;
  seedConfig?: Record<string, unknown>;
  /** Extra field paths to hide from props panel (e.g. complex wiring). */
  hiddenFields?: string[];
};

/** Editor-only hints — schemas remain the source of truth for fields and types. */
export const EDITOR_COMPONENT_OVERRIDES: Record<string, EditorComponentOverride> = {
  Text: {
    label: "Text block",
    preferredParentType: "Stack",
    seedLabels: { content: "New text block" },
  },
  Button: {
    preferredParentType: "Stack",
    seedLabels: { text: "Click me" },
  },
  Image: {
    preferredParentType: "Stack",
    seedConfig: { src: "https://placehold.co/800x400" },
  },
  Grid: {
    preferredParentType: "Stack",
  },
  Hero: {
    label: "Hero banner",
    preferredParentType: "Stack",
    seedLabels: { title: "New hero" },
  },
  ProductCard: {
    preferredParentType: "Grid",
    configStateBindings: {
      productId: "productId",
      title: "title",
      price: "price",
      image: "image",
      description: "description",
    },
    seedLabels: {
      addToCart: "Add to Cart",
      adding: "Adding…",
      addedToCart: "Added to cart",
      addFailed: "Could not add to cart",
    },
  },
};
