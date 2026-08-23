# Commerce Component Catalog Requirements
## Complete Component Specification for json-render Integration
### As of 2026-08-22

---

## Overview

The commerce component catalog is the **bridge between AI-generated JSON schemas and rendered UI**. Every component must:
1. Be registered in the json-render catalog with Zod schema validation
2. Have a React implementation in `packages/extensions/src/commerce/components.tsx`
3. Include edit metadata for the visual inline editor
4. Support actions for interactivity (addToCart, checkout, etc.)
5. Be accessible via the AI generation pipeline

---

## Currently Implemented (2 of 50 Planned Components)

| Component | File | Schema | Actions | Edit Metadata |
|-----------|------|--------|---------|---------------|
| `Hero` | `components.tsx:25` | `catalog-schemas.ts:5-18` | `ctaAction` emit | Full |
| `ProductCard` | `components.tsx:68` | `catalog-schemas.ts:20-37` | `addToCart` | Full |

---

## Required Components (Priority Order)

### 1. ProductGrid — **CRITICAL**
**Purpose**: Display a grid of product cards with optional filtering, sorting, and pagination.

**Props Schema**:
```typescript
ProductGrid: {
  props: catalogProps(
    {
      // Labels (editable in visual editor)
      emptyStateText: z.string().default("No products found"),
      loadMoreText: z.string().default("Load More"),
      loadingText: z.string().default("Loading..."),
      errorText: z.string().default("Failed to load products"),
    },
    {
      // Config (data-bound from CMS/context)
      productIds: z.array(z.string()).default([]),      // Array of product IDs
      collectionId: z.string().optional(),              // Or collection reference
      columns: z.number().min(1).max(6).default(4),     // Desktop columns
      columnsMobile: z.number().min(1).max(2).default(2),
      columnsTablet: z.number().min(1).max(3).default(3),
      gap: z.number().default(4),                       // Tailwind gap units
      showPagination: z.boolean().default(false),
      productsPerPage: z.number().default(12),
      enableFilters: z.boolean().default(false),
      filterFields: z.array(z.enum(["price", "vendor", "type", "tag"])).default([]),
      sortOptions: z.array(z.enum(["featured", "best-selling", "alphabetical", "price-asc", "price-desc", "date-desc"])).default(["featured", "best-selling", "price-asc", "price-desc"]),
      defaultSort: z.enum(["featured", "best-selling", "alphabetical", "price-asc", "price-desc", "date-desc"]).default("featured"),
      variant: z.enum(["default", "compact", "featured"]).default("default"),
      showViewToggle: z.boolean().default(false),       // Grid/List toggle
    },
  ),
  description: "Responsive product grid with filtering, sorting, and pagination",
}
```

**Actions**: None (child ProductCard handles addToCart)

**Child Components**: Renders `ProductCard` for each product ID

**Edit Metadata**:
- Palette category: "Commerce > Listing"
- Drag-drop: Accepts ProductCard children (for manual curation)
- Props panel: All config fields editable
- Live preview: Shows product data from context

---

### 2. ProductInfo — **CRITICAL** (Product Detail Page)
**Purpose**: Complete product detail display with images, variants, pricing, description, reviews, and add-to-cart.

**Props Schema**:
```typescript
ProductInfo: {
  props: catalogProps(
    {
      // Labels
      priceLabel: z.string().default("Price"),
      saleLabel: z.string().default("Sale"),
      descriptionTitle: z.string().default("Description"),
      specificationsTitle: z.string().default("Specifications"),
      reviewsTitle: z.string().default("Reviews"),
      writeReviewText: z.string().default("Write a review"),
      addToCartText: z.string().default("Add to Cart"),
      addingText: z.string().default("Adding..."),
      addedText: z.string().default("Added!"),
      outOfStockText: z.string().default("Out of Stock"),
      selectVariantText: z.string().default("Select options"),
      quantityLabel: z.string().default("Quantity"),
      shareText: z.string().default("Share"),
      skuLabel: z.string().default("SKU:"),
      availabilityInStock: z.string().default("In Stock"),
      availabilityLowStock: z.string().default("Only {count} left"),
      availabilityOutOfStock: z.string().default("Out of Stock"),
    },
    {
      // Config
      productId: z.string(),
      variant: z.enum(["default", "sticky-atc", "sidebar", "full-width"]).default("default"),
      showGallery: z.boolean().default(true),
      galleryLayout: z.enum(["thumbnails", "dots", "mobile-swipe"]).default("thumbnails"),
      showReviews: z.boolean().default(true),
      showDescription: z.boolean().default(true),
      showSpecifications: z.boolean().default(false),
      showShareButtons: z.boolean().default(false),
      showSku: z.boolean().default(false),
      showVendor: z.boolean().default(false),
      showProductType: z.boolean().default(false),
      showTags: z.boolean().default(false),
      stickyAtcBreakpoint: z.enum(["mobile", "tablet", "desktop", "never"]).default("mobile"),
      enableQuantitySelector: z.boolean().default(true),
      maxQuantity: z.number().optional(),
      trustBadges: z.array(z.string()).default([]),     // ["free-shipping", "easy-returns", "secure-checkout"]
      relatedProductsCount: z.number().default(4),
      showRelatedProducts: z.boolean().default(false),
      // Variant selection UI
      variantSelectorType: z.enum(["dropdown", "buttons", "swatches"]).default("buttons"),
      colorSwatchMode: z.enum(["color", "image", "label"]).default("color"),
      sizeChartUrl: z.string().optional(),
    },
  ),
  description: "Complete product detail page with gallery, variants, pricing, description, and add-to-cart",
}
```

**Actions**:
- `addToCart` (emitted with selected variant + quantity)
- `selectVariant` (internal state update)
- `openSizeChart` (modal)
- `shareProduct` (Web Share API / clipboard)

**Child Components**: 
- `ProductGallery` (internal)
- `VariantSelector` (internal)
- `AddToCart` (can be separate or integrated)
- `ProductDescription` (RichTextRenderer)
- `ProductSpecifications` (table from variant options)
- `Reviews` (if enabled)
- `TrustBadges` (if configured)
- `RelatedProducts` (if enabled)

**Edit Metadata**:
- Palette category: "Commerce > Product"
- Complex component — props panel shows all config sections
- Live preview loads product data from context

---

### 3. AddToCart — **CRITICAL** (Standalone Button)
**Purpose**: Flexible add-to-cart button with variants for sticky mobile bar, inline, and express checkout.

**Props Schema**:
```typescript
AddToCart: {
  props: catalogProps(
    {
      // Labels
      addToCartText: z.string().default("Add to Cart"),
      addingText: z.string().default("Adding..."),
      addedText: z.string().default("Added! ✓"),
      errorText: z.string().default("Failed to add"),
      applePayText: z.string().default("Apple Pay"),
      googlePayText: z.string().default("Google Pay"),
      buyNowText: z.string().default("Buy Now"),
      selectOptionsText: z.string().default("Select Options"),
      outOfStockText: z.string().default("Out of Stock"),
    },
    {
      // Config
      productId: z.string(),
      variant: z.enum(["default", "sticky-mobile", "inline", "buy-now", "express"]).default("default"),
      // Sticky mobile
      stickyPosition: z.enum(["bottom", "top"]).default("bottom"),
      stickyThreshold: z.number().default(300),         // Scroll px before showing
      // Express checkout
      enableApplePay: z.boolean().default(true),
      enableGooglePay: z.boolean().default(true),
      enableShopPay: z.boolean().default(false),
      // Quantity
      enableQuantity: z.boolean().default(false),
      defaultQuantity: z.number().default(1),
      minQuantity: z.number().default(1),
      maxQuantity: z.number().optional(),
      // Variant handling
      requireVariantSelection: z.boolean().default(true),
      redirectToCart: z.boolean().default(false),
      showDrawer: z.boolean().default(true),
      // Styling
      size: z.enum(["sm", "md", "lg"]).default("md"),
      fullWidth: z.boolean().default(false),
      showPrice: z.boolean().default(true),
      priceFormat: z.enum(["full", "minimal"]).default("full"),
      // Animation
      successAnimation: z.enum(["checkmark", "pulse", "none"]).default("checkmark"),
      addedDuration: z.number().default(2000),
    },
  ),
  description: "Flexible add-to-cart button with sticky mobile, express checkout, and quantity variants",
}
```

**Actions**:
- `addToCart` (emits with productId, variantId, quantity)
- `buyNow` (addToCart + immediate checkout redirect)

**Edit Metadata**:
- Palette category: "Commerce > Product"
- Variant selector in props panel shows visual preview of each variant
- Live preview shows button states (default, loading, success, error)

---

### 4. CartDrawer — **CRITICAL**
**Purpose**: Sliding cart drawer with item list, quantity updates, discounts, shipping estimate, and checkout.

**Props Schema**:
```typescript
CartDrawer: {
  props: catalogProps(
    {
      // Labels
      title: z.string().default("Your Cart"),
      emptyText: z.string().default("Your cart is empty"),
      continueShoppingText: z.string().default("Continue Shopping"),
      checkoutText: z.string().default("Checkout"),
      subtotalLabel: z.string().default("Subtotal"),
      shippingLabel: z.string().default("Shipping"),
      taxLabel: z.string().default("Tax"),
      discountLabel: z.string().default("Discount"),
      totalLabel: z.string().default("Total"),
      discountPlaceholder: z.string().default("Discount code"),
      applyDiscountText: z.string().default("Apply"),
      removingText: z.string().default("Removing..."),
      updatingText: z.string().default("Updating..."),
      noteLabel: z.string().default("Order Note"),
      notePlaceholder: z.string().default("Special instructions..."),
      freeShippingProgress: z.string().default("Add ${amount} more for free shipping!"),
      estimatedShippingText: z.string().default("Estimated at checkout"),
      taxesIncludedText: z.string().default("Taxes included"),
      taxesExcludedText: z.string().default("Taxes calculated at checkout"),
    },
    {
      // Config
      position: z.enum(["left", "right", "bottom"]).default("right"),
      triggerSelector: z.string().optional(),           // CSS selector for open trigger
      showOnAdd: z.boolean().default(true),
      showShippingEstimator: z.boolean().default(true),
      shippingEstimatorFields: z.array(z.enum(["country", "province", "postalCode"])).default(["country", "postalCode"]),
      showDiscountCode: z.boolean().default(true),
      showOrderNote: z.boolean().default(false),
      showFreeShippingBar: z.boolean().default(true),
      freeShippingThreshold: z.number().optional(),     // In cents
      showTaxNotice: z.boolean().default(true),
      pricesIncludeTax: z.boolean().default(false),
      enableQuantityUpdate: z.boolean().default(true),
      enableRemoveItem: z.boolean().default(true),
      showProductImage: z.boolean().default(true),
      showVariantInfo: z.boolean().default(true),
      showSku: z.boolean().default(false),
      minWidth: z.number().default(380),
      maxWidth: z.number().default(480),
      // Behavior
      closeOnOverlayClick: z.boolean().default(true),
      closeOnEscape: z.boolean().default(true),
      lockBodyScroll: z.boolean().default(true),
      // Upsells
      showUpsells: z.boolean().default(false),
      upsellProductIds: z.array(z.string()).default([]),
      upsellTitle: z.string().default("You May Also Like"),
    },
  ),
  description: "Sliding cart drawer with items, quantities, discounts, shipping estimator, and checkout",
}
```

**Actions**:
- `updateCartItem` (quantity change)
- `removeCartItem`
- `applyDiscountCode`
- `removeDiscountCode`
- `estimateShipping`
- `proceedToCheckout`
- `toggleDrawer` (open/close)

**Child Components**:
- `CartItem` (internal, per line item)
- `CartSummary` (can be separate component)
- `DiscountCodeInput` (internal)
- `ShippingEstimator` (internal)
- `UpsellProducts` (internal, renders ProductCard)

**Edit Metadata**:
- Palette category: "Commerce > Cart"
- Preview shows drawer in open state with sample items
- Props panel organized: Layout, Content, Features, Upsells

---

### 5. CartSummary — **CRITICAL**
**Purpose**: Standalone cart summary (subtotal, shipping, tax, discount, total) for use in cart page, drawer, or checkout.

**Props Schema**:
```typescript
CartSummary: {
  props: catalogProps(
    {
      // Labels
      subtotalLabel: z.string().default("Subtotal"),
      shippingLabel: z.string().default("Shipping"),
      taxLabel: z.string().default("Tax"),
      discountLabel: z.string().default("Discount"),
      totalLabel: z.string().default("Total"),
      freeShippingProgress: z.string().default("Add ${amount} more for free shipping!"),
      estimatedShippingText: z.string().default("Estimated at checkout"),
      taxesIncludedText: z.string().default("Taxes included"),
      taxesExcludedText: z.string().default("Taxes calculated at checkout"),
    },
    {
      // Config
      cartId: z.string().optional(),                    // If not provided, uses context cart
      showFreeShippingBar: z.boolean().default(true),
      freeShippingThreshold: z.number().optional(),
      showTaxNotice: z.boolean().default(true),
      pricesIncludeTax: z.boolean().default(false),
      showLineItems: z.boolean().default(false),        // Show mini item list
      maxLineItems: z.number().default(3),
      compact: z.boolean().default(false),
      // Styling
      variant: z.enum(["default", "minimal", "detailed"]).default("default"),
      divider: z.boolean().default(true),
    },
  ),
  description: "Cart totals summary with subtotal, shipping, tax, discount, and total",
}
```

**Actions**: None (read-only display)

**Edit Metadata**:
- Palette category: "Commerce > Cart"
- Preview shows sample totals

---

### 6. CheckoutButton — **CRITICAL**
**Purpose**: Proceed to checkout button with express payment options.

**Props Schema**:
```typescript
CheckoutButton: {
  props: catalogProps(
    {
      // Labels
      checkoutText: z.string().default("Checkout"),
      processingText: z.string().default("Processing..."),
      applePayText: z.string().default("Apple Pay"),
      googlePayText: z.string().default("Google Pay"),
      shopPayText: z.string().default("Shop Pay"),
      paypalText: z.string().default("PayPal"),
      orText: z.string().default("or"),
    },
    {
      // Config
      cartId: z.string().optional(),
      variant: z.enum(["default", "express", "primary", "secondary"]).default("primary"),
      enableExpress: z.boolean().default(true),
      enableApplePay: z.boolean().default(true),
      enableGooglePay: z.boolean().default(true),
      enableShopPay: z.boolean().default(false),
      enablePayPal: z.boolean().default(false),
      fullWidth: z.boolean().default(true),
      size: z.enum(["md", "lg", "xl"]).default("lg"),
      showSecurityBadges: z.boolean().default(true),
      securityBadges: z.array(z.string()).default(["ssl", "pci", "encrypted"]),
      redirectOnClick: z.boolean().default(false),      // If false, uses action
    },
  ),
  description: "Checkout button with express payment options (Apple Pay, Google Pay, Shop Pay)",
}
```

**Actions**:
- `createCheckout` (creates Stripe session, redirects)
- `expressCheckout` (Apple/Google/Shop Pay flow)

**Edit Metadata**:
- Palette category: "Commerce > Cart"
- Variant preview shows button styles

---

### 7. CollectionPage — **HIGH**
**Purpose**: Complete collection/collection page with header, filters, product grid, and pagination.

**Props Schema**:
```typescript
CollectionPage: {
  props: catalogProps(
    {
      // Labels
      title: z.string().default("Collection"),
      description: z.string().optional(),
      emptyStateText: z.string().default("No products in this collection"),
      filterTitle: z.string().default("Filters"),
      clearFiltersText: z.string().default("Clear all"),
      sortLabel: z.string().default("Sort by"),
      resultsCountText: z.string().default("Showing {count} of {total} products"),
      loadMoreText: z.string().default("Load More"),
    },
    {
      // Config
      collectionId: z.string(),
      layout: z.enum(["sidebar-filters", "top-filters", "drawer-filters", "no-filters"]).default("sidebar-filters"),
      productGrid: z.object({                           // Nested ProductGrid config
        columns: z.number().min(1).max(6).default(4),
        columnsMobile: z.number().min(1).max(2).default(2),
        gap: z.number().default(4),
        showPagination: z.boolean().default(true),
        productsPerPage: z.number().default(24),
      }).optional(),
      enableFilters: z.boolean().default(true),
      filterFields: z.array(z.enum(["price", "vendor", "type", "tag", "availability"])).default(["price", "vendor", "type", "availability"]),
      priceRange: z.object({
        min: z.number().default(0),
        max: z.number().default(100000),
      }).optional(),
      sortOptions: z.array(z.enum(["featured", "best-selling", "alphabetical", "price-asc", "price-desc", "date-desc"])).default(["featured", "best-selling", "price-asc", "price-desc", "date-desc"]),
      defaultSort: z.enum(["featured", "best-selling", "alphabetical", "price-asc", "price-desc", "date-desc"]).default("featured"),
      showCollectionImage: z.boolean().default(true),
      showCollectionDescription: z.boolean().default(true),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
    },
  ),
  description: "Complete collection page with header, filters, product grid, and pagination",
}
```

**Child Components**:
- `CollectionHeader` (title, description, image)
- `FilterSidebar` / `FilterDrawer` / `FilterBar` (based on layout)
- `ProductGrid` (nested)
- `Pagination` / `LoadMore` (nested)

**Actions**:
- `applyFilters`
- `clearFilters`
- `sortProducts`
- `loadMore`

**Edit Metadata**:
- Palette category: "Commerce > Listing"
- Complex page-level component
- Props panel has nested ProductGrid config

---

### 8. SearchResults — **HIGH**
**Purpose**: Search results page with query display, filters, results grid, and suggestions.

**Props Schema**:
```typescript
SearchResults: {
  props: catalogProps(
    {
      // Labels
      title: z.string().default("Search Results"),
      noResultsText: z.string().default("No results found for \"{query}\""),
      suggestionsText: z.string().default("Did you mean:"),
      filterTitle: z.string().default("Filters"),
      clearFiltersText: z.string().default("Clear all"),
      sortLabel: z.string().default("Sort by"),
      resultsCountText: z.string().default("Showing {count} of {total} results for \"{query}\""),
    },
    {
      // Config
      query: z.string(),                                // From URL/search context
      layout: z.enum(["sidebar-filters", "top-filters", "drawer-filters"]).default("sidebar-filters"),
      productGrid: z.object({
        columns: z.number().min(1).max(6).default(4),
        columnsMobile: z.number().min(1).max(2).default(2),
        gap: z.number().default(4),
        showPagination: z.boolean().default(true),
        productsPerPage: z.number().default(24),
      }).optional(),
      enableFilters: z.boolean().default(true),
      filterFields: z.array(z.enum(["price", "vendor", "type", "tag", "availability"])).default(["price", "vendor", "type", "availability"]),
      sortOptions: z.array(z.enum(["relevance", "best-selling", "alphabetical", "price-asc", "price-desc", "date-desc"])).default(["relevance", "best-selling", "price-asc", "price-desc", "date-desc"]),
      defaultSort: z.enum(["relevance", "best-selling", "alphabetical", "price-asc", "price-desc", "date-desc"]).default("relevance"),
      showSuggestions: z.boolean().default(true),
      maxSuggestions: z.number().default(5),
      highlightMatches: z.boolean().default(true),
    },
  ),
  description: "Search results page with query, filters, suggestions, and product grid",
}
```

**Child Components**: Similar to CollectionPage

**Actions**: Same as CollectionPage + `trackSearch`

---

### 9. Pagination — **HIGH**
**Purpose**: Page navigation for product grids, collections, search results.

**Props Schema**:
```typescript
Pagination: {
  props: catalogProps(
    {
      // Labels
      previousText: z.string().default("Previous"),
      nextText: z.string().default("Next"),
      pageText: z.string().default("Page"),
      ofText: z.string().default("of"),
      showingText: z.string().default("Showing {start}-{end} of {total}"),
    },
    {
      // Config
      totalPages: z.number(),
      currentPage: z.number().default(1),
      totalItems: z.number().optional(),
      itemsPerPage: z.number().optional(),
      variant: z.enum(["numbers", "load-more", "infinite-scroll", "prev-next"]).default("numbers"),
      maxVisiblePages: z.number().default(5),
      showFirstLast: z.boolean().default(true),
      showItemCount: z.boolean().default(false),
      // Infinite scroll
      loadMoreText: z.string().default("Load More"),
      loadingText: z.string().default("Loading..."),
      endOfResultsText: z.string().default("End of results"),
    },
  ),
  description: "Pagination controls with multiple variants (numbers, load more, infinite scroll)",
}
```

**Actions**:
- `goToPage`
- `nextPage`
- `previousPage`
- `loadMore`

---

### 10. ProductVariants — **HIGH**
**Purpose**: Variant selector (size, color, material) with price updates and availability.

**Props Schema**:
```typescript
ProductVariants: {
  props: catalogProps(
    {
      // Labels
      selectOptionText: z.string().default("Select {optionName}"),
      unavailableText: z.string().default("Unavailable"),
      priceUpdateText: z.string().default("Price: {price}"),
    },
    {
      // Config
      productId: z.string(),
      selectedVariantId: z.string().optional(),
      variantSelectorType: z.enum(["dropdown", "buttons", "swatches"]).default("buttons"),
      colorSwatchMode: z.enum(["color", "image", "label"]).default("color"),
      showPriceDifferences: z.boolean().default(true),
      showAvailability: z.boolean().default(true),
      hideUnavailable: z.boolean().default(false),
      // Option ordering
      optionOrder: z.array(z.string()).optional(),      // ["Color", "Size", "Material"]
      // Swatch config
      swatchSize: z.number().default(36),
      swatchGap: z.number().default(2),
      showSwatchLabels: z.boolean().default(false),
      // Behavior
      autoSelectFirstAvailable: z.boolean().default(true),
      requireAllOptions: z.boolean().default(true),
    },
  ),
  description: "Variant selector (size, color, material) with swatches, price updates, and availability",
}
```

**Actions**:
- `selectVariantOption` (optionName, value)
- `selectVariant` (variantId)

**Edit Metadata**:
- Palette category: "Commerce > Product"
- Preview shows all variant types

---

### 11. QuantitySelector — **MEDIUM**
**Purpose**: Quantity input with increment/decrement, min/max, and stock validation.

**Props Schema**:
```typescript
QuantitySelector: {
  props: catalogProps(
    {
      // Labels
      quantityLabel: z.string().default("Quantity"),
      decreaseAriaLabel: z.string().default("Decrease quantity"),
      increaseAriaLabel: z.string().default("Increase quantity"),
      maxStockText: z.string().default("Maximum stock reached"),
      minQuantityText: z.string().default("Minimum quantity is {min}"),
    },
    {
      // Config
      value: z.number().default(1),
      min: z.number().default(1),
      max: z.number().optional(),                       // From variant inventory
      step: z.number().default(1),
      variant: z.enum(["default", "compact", "inline"]).default("default"),
      showInput: z.boolean().default(true),
      inputWidth: z.number().default(60),
      buttonSize: z.number().default(36),
      disabled: z.boolean().default(false),
    },
  ),
  description: "Quantity selector with increment/decrement buttons and stock validation",
}
```

**Actions**:
- `increment`
- `decrement`
- `setQuantity`

---

### 12. TrustBadges — **MEDIUM**
**Purpose**: Trust indicators (secure checkout, free shipping, returns, etc.)

**Props Schema**:
```typescript
TrustBadges: {
  props: catalogProps(
    {
      // Labels (per badge)
      badges: z.array(z.object({
        id: z.string(),
        label: z.string(),
        icon: z.string().optional(),                    // Icon name or SVG
        description: z.string().optional(),
      })).default([
        { id: "secure", label: "Secure Checkout", icon: "shield" },
        { id: "shipping", label: "Free Shipping $50+", icon: "truck" },
        { id: "returns", label: "Easy 30-Day Returns", icon: "rotate-ccw" },
        { id: "support", label: "24/7 Support", icon: "headphones" },
      ]),
    },
    {
      // Config
      variant: z.enum(["inline", "stacked", "grid"]).default("inline"),
      size: z.enum(["sm", "md", "lg"]).default("md"),
      showIcons: z.boolean().default(true),
      showDescriptions: z.boolean().default(false),
      gap: z.number().default(4),
      alignment: z.enum(["left", "center", "right"]).default("center"),
    },
  ),
  description: "Trust badges for security, shipping, returns, and support",
}
```

---

### 13. SocialProof — **MEDIUM**
**Purpose**: Reviews carousel, UGC, "X people viewing", recent purchases.

**Props Schema**:
```typescript
SocialProof: {
  props: catalogProps(
    {
      // Labels
      reviewsTitle: z.string().default("Customer Reviews"),
      writeReviewText: z.string().default("Write a Review"),
      noReviewsText: z.string().default("No reviews yet"),
      viewingText: z.string().default("{count} people viewing this"),
      purchasedText: z.string().default("{name} from {location} just purchased {product}"),
      ugcTitle: z.string().default("Customer Photos"),
      loadMoreReviewsText: z.string().default("Load More Reviews"),
    },
    {
      // Config
      productId: z.string().optional(),
      variant: z.enum(["reviews-carousel", "review-summary", "live-viewers", "recent-purchases", "ugc-carousel", "combined"]).default("combined"),
      showRatingSummary: z.boolean().default(true),
      showReviewCount: z.boolean().default(true),
      maxReviews: z.number().default(10),
      maxUgcItems: z.number().default(8),
      maxLiveViewers: z.number().default(5),
      maxRecentPurchases: z.number().default(10),
      recentPurchaseWindow: z.number().default(3600),   // Seconds
      autoRotate: z.boolean().default(true),
      rotateInterval: z.number().default(5000),
      showAvatars: z.boolean().default(true),
      showVerifiedBadge: z.boolean().default(true),
      // Conditions
      condition: z.string().optional(),                 // Template expression
    },
  ),
  description: "Social proof: reviews, live viewers, recent purchases, UGC carousel",
}
```

---

### 14. RelatedProducts — **MEDIUM**
**Purpose**: Cross-sell/upsell product recommendations.

**Props Schema**:
```typescript
RelatedProducts: {
  props: catalogProps(
    {
      // Labels
      title: z.string().default("You May Also Like"),
      subtitle: z.string().optional(),
      emptyText: z.string().default("No recommendations available"),
    },
    {
      // Config
      productId: z.string().optional(),                 // For "related to this product"
      algorithm: z.enum(["ml-bundle", "similar", "complementary", "recently-viewed", "bought-together", "manual"]).default("ml-bundle"),
      maxItems: z.number().default(4),
      manualProductIds: z.array(z.string()).default([]),
      productGrid: z.object({
        columns: z.number().min(1).max(6).default(4),
        columnsMobile: z.number().min(1).max(2).default(2),
        gap: z.number().default(4),
        variant: z.enum(["default", "compact"]).default("compact"),
      }).optional(),
      showPrice: z.boolean().default(true),
      showQuickAdd: z.boolean().default(false),
    },
  ),
  description: "AI-powered product recommendations (bundles, similar, complementary, recently viewed)",
}
```

**Child Components**: `ProductGrid` (nested)

**Actions**: Same as ProductGrid

---

### 15. ShippingEstimator — **MEDIUM**
**Purpose**: Shipping rate calculator by zip code / address.

**Props Schema**:
```typescript
ShippingEstimator: {
  props: catalogProps(
    {
      // Labels
      title: z.string().default("Estimate Shipping"),
      countryLabel: z.string().default("Country"),
      provinceLabel: z.string().default("State/Province"),
      postalCodeLabel: z.string().default("ZIP/Postal Code"),
      calculateText: z.string().default("Calculate"),
      calculatingText: z.string().default("Calculating..."),
      noRatesText: z.string().default("No shipping rates available for this address"),
      freeShippingText: z.string().default("Free!"),
      deliveryTimeText: z.string().default("{min}-{max} business days"),
    },
    {
      // Config
      cartId: z.string().optional(),
      defaultCountry: z.string().default("US"),
      showCountry: z.boolean().default(true),
      showProvince: z.boolean().default(true),
      showPostalCode: z.boolean().default(true),
      showCity: z.boolean().default(false),
      ratesSort: z.enum(["price-asc", "price-desc", "time-asc"]).default("price-asc"),
      hidePriceForFree: z.boolean().default(true),
      showDeliveryTime: z.boolean().default(true),
    },
  ),
  description: "Shipping rate estimator by address with carrier options and delivery times",
}
```

**Actions**:
- `estimateShipping` (address) → returns rates
- `selectShippingRate` (rateId)

---

## Catalog Expansion — Platform & Library Survey (2026-08-22 Re-Verification)

The 15 components above cover the *transactional spine* only. A survey of what popular platforms actually ship in their storefront component libraries shows that is roughly one-third of a credible catalog. Survey basis:

| Source | What it ships | Takeaway |
|--------|--------------|----------|
| **WooCommerce core blocks** | ~25 blocks incl. Product Search, All Products/Product Collection, Featured Product/Category, Hand-Picked, Best Sellers, Filter by Price/Stock/Attribute/Rating, Active Filters, Mini-Cart + drawer, Cart, Checkout, All Reviews, Reviews by Product/Category, Customer Account | Filtering, merchandising grids, and reviews are first-class, not app-level |
| **Shopify Dawn / OS 2.0 sections** | ~25 section types incl. announcement bar, image banner, slideshow, video, collage, multicolumn, featured collection/product, collection list, collapsible FAQ, newsletter signup + header/footer/mega-menu groups | Most Dawn sections are *domain-neutral merchandising/content* sections, not commerce logic |
| **Saleor "Paper" storefront** | Dynamic menus + breadcrumbs, region picker/locale routing, login/register/reset + guest checkout, order confirmation route, account dashboard w/ address book/order history/password change | Post-purchase and account surfaces are part of the storefront, not the admin |
| **Medusa DTC starter** | Multi-region w/ country detection, variant selection, cart + promotion codes, multi-step checkout, customer accounts w/ order history + addresses | Checkout flow + account surfaces are baseline storefront scope |
| **Baymard-style CRO patterns** | Sticky ATC, free-shipping progress, back-in-stock notify, size guides, quick view | Conversion-hygiene components expected on any serious PDP |

### Catalog Split Rule

Not everything below belongs to the commerce extension. A component goes to the **Site catalog** if it renders identically on a blog, portfolio, or content site (no product/cart/order context required). Only components that read commerce context (product, variant, cart, order, customer) stay in the **commerce catalog**. This matches the platform's extension model: `coreComponents` already owns layout atoms (`Grid`, `Stack`, `Text`, `Button`, `Image`) in `packages/client/src/core/components.tsx`; domain-neutral *sections* get a Site catalog alongside `packages/extensions/src/commerce/`.

**Backlog totals**: 15 core (above) + 21 commerce expansion + 12 site catalog = **48 to build, 50 planned total incl. Hero + ProductCard**. Expansion entries are specified briefly; each receives the full §1–15 treatment when its phase starts. The list is intentionally kept maximal — prune later against the removal criteria at the end of this section.

### Expansion A — Commerce: Listing & Merchandising (6)

| Component | Purpose | Priority |
|-----------|---------|----------|
| `FilterGroups` | Price range/slider, attribute swatches, rating, stock toggles + active-filter chips (composable inside CollectionPage/SearchResults) | High |
| `ProductSlider` | Horizontal scroll/swipe row of ProductCards (featured collections) | High |
| `CollectionList` | Grid of collection cards w/ images + counts | High |
| `FeaturedProductSpotlight` | Single-product hero section w/ CTA + media | High |
| `QuickView` | Card-hover modal preview + quick add | Medium |
| `RecentlyViewed` | Session-scoped product row | Medium |

### Expansion B — Commerce: PDP Enhancement (6)

| Component | Purpose | Priority |
|-----------|---------|----------|
| `ProductGallery` | Standalone gallery (zoom, thumbnails/dots/swipe) extracted from ProductInfo so AI can compose layouts freely | High |
| `ReviewsList` | Ratings summary + breakdown bars + paginated review list | High |
| `ReviewForm` | Merchant-approved UGC review capture | Medium |
| `BackInStockNotify` | "Notify me" for out-of-stock variants | Medium |
| `BundleAdd` | Frequently-bought-together multi-add with combined price/savings | Medium |
| `SizeGuide` | Modal size/measurement chart (table or image) | Low |

### Expansion C — Commerce: Cart, Checkout & Account (9)

| Component | Purpose | Priority |
|-----------|---------|----------|
| `CheckoutFlow` | Full-page multi-step checkout: contact → shipping → payment → review (URL-driven steps). Post-MVP: Phase 0 demo redirects to Stripe-hosted checkout | Critical |
| `AddressForm` | Internationalized address fields w/ validation + autocomplete | Critical |
| `ShippingMethodSelector` | Rate options w/ price + delivery estimate | High |
| `PaymentMethodSelector` | Gateway/wallet selection incl. saved instruments | High |
| `OrderConfirmation` | Thank-you page: order recap, account-create prompt, next steps | High |
| `OrdersPanel` | Account order history w/ status + reorder; guest order-lookup variant | High |
| `AccountPanel` | Profile, address book, password change | Medium |
| `WishlistToggle` | Heart/save control on cards + PDP (guest state merges on login) | Medium |
| `WishlistGrid` | Saved-items grid w/ move-to-cart | Medium |

### Expansion D — Site Catalog (Domain-Neutral, 12)

These render without commerce context (news sites, portfolios, B2B landing pages) — same components a yoga store and a magazine both need. Target home: a Site catalog next to the commerce extension; not `packages/extensions/src/commerce/`.

| Component | Purpose | Priority |
|-----------|---------|----------|
| `StoreHeader` | Logo + mega-menu nav + search trigger + cart/account slots; sticky variant. Slots stay empty on non-commerce sites | Critical |
| `AnnouncementBar` | Top promo strip (dismissable, scheduled messages) | High |
| `StoreFooter` | Link columns, newsletter slot, payment badges slot, socials | High |
| `Breadcrumbs` | Trail for any hierarchical page; SEO microdata | Medium |
| `PredictiveSearch` | Typeahead over products/categories/content — commerce results arrive via injected adapter | High |
| `LocaleSelector` | Country/currency/language picker | Medium |
| `NewsletterSignup` | Email capture w/ consent + integration hook | High |
| `FaqAccordion` | Schema-driven Q&A accordion w/ FAQ structured data | High |
| `MediaShowcase` | Slideshow/video merchandising section | High |
| `MediaCollage` | Mixed image/video/card collage tiles | Low |
| `SocialTestimonials` | Static testimonials/logo cloud (vs. dynamic `SocialProof`) | Medium |
| `NoticeToasts` | Global store notices (add-to-cart, errors, flags) | Medium |

> Overlap note: `StoreHeader`'s cart trigger and `PredictiveSearch`'s product results consume commerce context via props/adapters but the components themselves stay domain-neutral — same pattern as `ProductGrid` consuming product data through json-render bindings.

### UI Primitive Base (shadcn Inventory Check — updated 2026-08-22 late)

Two layers supply UI primitives:

1. **Catalog level (added 2026-08-22)**: `@json-render/shadcn@0.20.0` is installed and merged into the storefront catalog via `packages/client/src/component-schemas.ts` (`shadcnComponentDefinitions`; `catalog.ts` builds from the merge). This contributes **36 ready-made component schemas** — Card, Stack, Grid, Separator, Tabs, Accordion, Collapsible, Dialog, Drawer, Carousel, Table, Heading, Text, Image, Avatar, Badge, Alert, Progress, Skeleton, Spinner, Tooltip, Popover, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Button, Link, DropdownMenu, Toggle, ToggleGroup, ButtonGroup, Pagination — so AI-generated layouts can reference them today. (`@json-render/core|react|react-email` bumped 0.19.0 → 0.20.0 in the same change.)
2. **Local level**: `packages/client/src/components/ui/` carries 8 hand-rolled shadcn primitives (`alert`, `badge`, `button`, `card`, `input`, `label`, `separator`, `table`) used by admin/editor chrome.

Mapping to catalog components (✅ = schema already available via `@json-render/shadcn`; remaining work is the React renderer + commerce wrapper, not new primitives):

| Catalog component | Primitive coverage |
|-------------------|--------------------|
| `FaqAccordion`, ProductInfo spec tables | ✅ `Accordion` / `Collapsible` |
| `CartDrawer`, `QuickView`, `SizeGuide`, mobile filter drawers | ✅ `Drawer` / `Dialog` |
| `MediaShowcase`, `ProductSlider`, `SocialProof` carousels | ✅ `Carousel` |
| `FilterGroups`, `QuantitySelector`, checkout forms | ✅ `Checkbox`, `Radio`, `Select`, `Switch`, `Slider`, `Input`, `Textarea` |
| Commerce `Pagination` | ✅ composes the `Pagination` primitive |
| Free-shipping progress bars | ✅ `Progress` |
| Review avatars / loading skeletons / `TrustBadges` tooltips / PDP tabs | ✅ `Avatar`, `Skeleton`, `Spinner`, `Tooltip`, `Tabs` |
| `NoticeToasts` | ❌ no toast primitive in the set yet — add `sonner` when this lands |

> ⚠️ **Name-collision check**: `Stack`, `Grid`, `Text`, `Button`, `Image` exist in both `baseComponentSchemas` and `shadcnComponentDefinitions`; because `component-schemas.ts` spreads shadcn last, the shadcn variants silently win. Confirm that override is intended before wiring renderers, or drop/rename the base duplicates.

### Removal Criteria (Prune Later, Not Now)

Keep the backlog maximal now; drop an item later only when it fails **all** of: (1) no precedent in WooCommerce/Dawn/Saleor/Medusa surface inventory, (2) not reachable by AI composition from existing components, (3) no attribution/experiment value, (4) not required by the demo acceptance walk in CURRENT-UX-AUDIT.md.

---

## Implementation Checklist

### Phase 1: Core Commerce Components (Week 2-3)
- [ ] `ProductGrid` — with filtering, sorting, pagination
- [ ] `ProductInfo` — complete PDP with variants, gallery, reviews
- [ ] `AddToCart` — all variants (sticky, inline, express, buy-now)
- [ ] `CartDrawer` — full cart management
- [ ] `CartSummary` — totals display
- [ ] `CheckoutButton` — with express payments

### Phase 2: Listing & Discovery (Week 3)
- [ ] `CollectionPage` — complete collection page
- [ ] `SearchResults` — search with suggestions
- [ ] `Pagination` — multiple variants

### Phase 3: Product Enhancement (Week 3-4)
- [ ] `ProductVariants` — size/color/material selectors
- [ ] `QuantitySelector` — with stock validation
- [ ] `TrustBadges` — configurable badges
- [ ] `SocialProof` — reviews, live viewers, recent purchases
- [ ] `RelatedProducts` — AI recommendations
- [ ] `ShippingEstimator` — rate calculation

### Phase 4+: Expansion Waves (Post-Core, Prune Against Removal Criteria)
Commerce catalog:
- Wave 1 (merchandising parity): `FilterGroups`, `ProductSlider`, `CollectionList`, `FeaturedProductSpotlight`, `ProductGallery`, `ReviewsList`
- Wave 2 (checkout completion, needs server domain): `CheckoutFlow`, `AddressForm`, `ShippingMethodSelector`, `PaymentMethodSelector`, `OrderConfirmation`, `OrdersPanel`, `AccountPanel`
- Wave 3 (retention & CRO): `WishlistToggle`, `WishlistGrid`, `ReviewForm`, `BackInStockNotify`, `BundleAdd`, `RecentlyViewed`, `QuickView`, `SizeGuide`

Site catalog (domain-neutral — separate extension/home):
- Wave S1: `StoreHeader`, `AnnouncementBar`, `StoreFooter`, `PredictiveSearch`, `NewsletterSignup`, `FaqAccordion`, `MediaShowcase`, `NoticeToasts`
- Wave S2: `Breadcrumbs`, `LocaleSelector`, `SocialTestimonials`, `MediaCollage`

---

## Component Architecture Notes

### Component Composition Pattern
```typescript
// CollectionPage uses ProductGrid internally
// ProductGrid uses ProductCard for each item
// ProductInfo uses ProductVariants, AddToCart, TrustBadges, SocialProof, RelatedProducts
// CartDrawer uses CartSummary, CartItem (internal), ShippingEstimator, DiscountCodeInput
```

### Data Flow
```
AI generates JSON schema
       │
       ▼
json-render resolves $template bindings (product data from CMS)
       │
       ▼
Component receives resolved props (config + labels)
       │
       ▼
Component renders UI
       │
       ├── User interaction → emits action
       │       │
       │       ▼
       │  Action handler (cart.ts, checkout.ts) → API call
       │       │
       │       ▼
       │  Server updates state (cart, order)
       │       │
       │       ▼
       └── json-render SpecStream patch → UI updates
```

### Edit Metadata Requirements
Every component must export:
```typescript
export const componentEditMetadata = {
  // For visual editor palette
  category: "Commerce > Product",           // Category in palette
  icon: "Package",                          // Lucide icon name
  tags: ["commerce", "product", "pdp"],     // Search tags
  
  // For props panel
  propsGroups: [
    { label: "Content", fields: ["title", "description", ...] },
    { label: "Layout", fields: ["variant", "columns", ...] },
    { label: "Behavior", fields: ["enableFilters", "showPagination", ...] },
    { label: "Styling", fields: ["gap", "size", "alignment", ...] },
  ],
  
  // For live preview
  preview: {
    sampleProps: { ... },                   // Sample config for preview
    sampleData: { ... },                    // Sample CMS data (product, cart)
  },
  
  // For AI generation
  aiPrompt: "A product detail page with image gallery, variant selectors, price, description, reviews, and add-to-cart button. Mobile-first with sticky add-to-cart bar.",
  aiContext: ["product", "variant", "inventory", "reviews"],
};
```

---

## Integration with AI Generation Pipeline

The AI layout LLM needs to know about all components. Each component should be documented in the AI prompt context:

```markdown
## Available Commerce Components

### Hero
Full-width banner with title, subtitle, image, and CTA.
Props: { title, subtitle, ctaText, image, ctaAction }
Use for: Homepage hero, collection header, landing pages

### ProductGrid
Responsive grid of product cards with filtering, sorting, pagination.
Props: { productIds[], collectionId, columns, enableFilters, sortOptions, variant }
Children: ProductCard (auto-rendered per productId)
Use for: Collection pages, search results, homepage featured products, related products

### ProductInfo
Complete product detail page with gallery, variants, pricing, description, reviews, add-to-cart.
Props: { productId, variant, showGallery, showReviews, variantSelectorType, trustBadges[], showRelatedProducts }
Use for: Product detail pages (PDP)

### AddToCart
Flexible add-to-cart button: default, sticky-mobile, inline, buy-now, express.
Props: { productId, variant, enableApplePay, enableGooglePay, enableQuantity, redirectToCart, showDrawer }
Actions: addToCart, buyNow
Use for: PDP, ProductCard, CartDrawer upsells, sticky mobile bar

### CartDrawer
Sliding cart with items, quantities, discounts, shipping estimator, checkout.
Props: { position, showShippingEstimator, showDiscountCode, freeShippingThreshold, upsellProductIds[] }
Actions: updateCartItem, removeCartItem, applyDiscountCode, estimateShipping, proceedToCheckout
Use for: Mini-cart, slide-out cart, mobile cart

### CartSummary
Cart totals: subtotal, shipping, tax, discount, total.
Props: { cartId, showFreeShippingBar, freeShippingThreshold, pricesIncludeTax, compact }
Use for: CartDrawer, CartPage, Checkout sidebar

### CheckoutButton
Proceed to checkout with express payments (Apple Pay, Google Pay, Shop Pay).
Props: { cartId, variant, enableExpress, enableApplePay, enableGooglePay, enableShopPay, enablePayPal }
Actions: createCheckout, expressCheckout
Use for: CartDrawer, CartPage, sticky mobile bar

### CollectionPage
Complete collection page with header, filters, product grid, pagination.
Props: { collectionId, layout, productGrid{}, enableFilters, filterFields[], sortOptions[] }
Children: CollectionHeader, FilterSidebar, ProductGrid, Pagination
Use for: Collection URLs (/collections/{handle})

### SearchResults
Search results with query, filters, suggestions, product grid.
Props: { query, layout, productGrid{}, enableFilters, sortOptions[], showSuggestions }
Use for: Search page (/search?q=...)

### ProductVariants
Size/color/material selectors with swatches and price updates.
Props: { productId, variantSelectorType, colorSwatchMode, showPriceDifferences, showAvailability }
Actions: selectVariantOption, selectVariant
Use for: ProductInfo, ProductCard (quick view), AddToCart (inline variant)

### RelatedProducts
AI-powered recommendations: ml-bundle, similar, complementary, recently-viewed, bought-together.
Props: { productId, algorithm, maxItems, productGrid{} }
Use for: ProductInfo, CartDrawer, Checkout, Post-purchase
```

---

## Next Steps

1. **Implement components in priority order** (Phase 1 → Phase 2 → Phase 3)
2. **Register each in `catalog-schemas.ts`** with full Zod schemas
3. **Add React components to `components.tsx`** with proper TypeScript types
4. **Export edit metadata** for visual editor integration
5. **Test with json-render** via visual editor (`?edit=true`)
6. **Document for AI generation pipeline** (add to prompt context)
7. **Wire server APIs** (cart, checkout, products) for live data