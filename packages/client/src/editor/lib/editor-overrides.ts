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
  TextBase: {
    label: "Text block",
    preferredParentType: "StackBase",
    seedLabels: { content: "New text block" },
  },
  ButtonBase: {
    preferredParentType: "StackBase",
    seedLabels: { label: "Click me" },
  },
  ImageBase: {
    preferredParentType: "StackBase",
    seedConfig: { src: "https://placehold.co/800x400" },
  },
  GridBase: {
    preferredParentType: "StackBase",
  },
  Hero: {
    label: "Hero banner",
    preferredParentType: "StackBase",
    seedLabels: { title: "New hero" },
  },
  ProductGrid: {
    label: "Product grid",
    preferredParentType: "StackBase",
    seedConfig: { minColumnWidthPx: 260, gap: 20 },
    seedLabels: { title: "Featured products", description: null },
  },
  ProductCard: {
    preferredParentType: "ProductGrid",
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
  ProductInfo: {
    label: "Product details",
    preferredParentType: "StackBase",
    configStateBindings: {
      productId: "productId",
      title: "title",
      price: "price",
      image: "image",
      description: "description",
    },
    seedConfig: { currency: "CAD", imageAlt: null, maxQuantity: 99 },
    seedLabels: {
      quantityLabel: "Quantity",
      decreaseQuantityLabel: "Decrease quantity",
      increaseQuantityLabel: "Increase quantity",
      addToCartLabel: "Add to Cart",
      addingLabel: "Adding…",
      addedToCartMessage: "Added to cart",
      addFailedMessage: "Could not add to cart",
    },
  },
  CartDrawer: {
    label: "Cart drawer",
    preferredParentType: "StackBase",
    seedConfig: { currency: "CAD" },
    seedLabels: {
      title: "Your cart",
      openLabel: "Open cart",
      closeLabel: "Close cart",
      loadingLabel: "Loading cart…",
      emptyLabel: "Your cart is empty",
      errorLabel: "Your cart could not be updated",
      subtotalLabel: "Subtotal",
      removeItemLabel: "Remove",
      decreaseQuantityLabel: "Decrease quantity",
      increaseQuantityLabel: "Increase quantity",
      checkoutLabel: "Checkout",
      priceUnavailableLabel: "Price unavailable",
    },
  },
  CheckoutButton: {
    label: "Checkout button",
    preferredParentType: "StackBase",
    seedConfig: { variant: "primary" },
    seedLabels: {
      checkoutLabel: "Checkout",
      loadingLabel: "Preparing checkout…",
      errorLabel: "Could not start checkout",
    },
  },
  CollectionPage: {
    label: "Product collection",
    preferredParentType: "StackBase",
    seedConfig: {
      listingKey: "featured-products",
      contentType: "product",
      collectionSlug: null,
      pageSize: 12,
      currency: "CAD",
      productIdField: "productId",
      titleField: "title",
      priceField: "price",
      imageField: "image",
      descriptionField: "description",
    },
    seedLabels: {
      title: "Products",
      loadingLabel: "Loading products…",
      emptyLabel: "No products found",
      errorLabel: "Products could not be loaded",
      priceUnavailableLabel: "Price unavailable",
      addToCartLabel: "Add to Cart",
      addingLabel: "Adding…",
      addedToCartMessage: "Added to cart",
      addFailedMessage: "Could not add to cart",
    },
  },
  SearchResults: {
    label: "Product search",
    preferredParentType: "StackBase",
    seedConfig: {
      listingKey: "product-search",
      contentType: "product",
      collectionSlug: null,
      pageSize: 12,
      currency: "CAD",
      productIdField: "productId",
      titleField: "title",
      priceField: "price",
      imageField: "image",
      descriptionField: "description",
    },
    seedLabels: {
      title: "Search products",
      searchPlaceholder: "Search products",
      searchButtonLabel: "Search",
      loadingLabel: "Searching…",
      emptyLabel: "No products found",
      errorLabel: "Products could not be loaded",
      priceUnavailableLabel: "Price unavailable",
      addToCartLabel: "Add to Cart",
      addingLabel: "Adding…",
      addedToCartMessage: "Added to cart",
      addFailedMessage: "Could not add to cart",
    },
  },
  Pagination: {
    label: "Pagination",
    preferredParentType: "StackBase",
    seedConfig: { listingKey: "featured-products" },
    seedLabels: { previousLabel: "Previous", nextLabel: "Next", pageLabel: "Page" },
  },
};
