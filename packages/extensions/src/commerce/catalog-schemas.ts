import { z } from "zod";

const productListingFields = {
  productIdField: z.string().min(1),
  titleField: z.string().min(1),
  priceField: z.string().min(1),
  imageField: z.string().min(1),
  descriptionField: z.string().min(1),
};

export const commerceComponentSchemas = {
  OrdersAdmin: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      loadingLabel: z.string(),
      emptyLabel: z.string(),
      refreshLabel: z.string(),
      refreshingLabel: z.string(),
      forbiddenLabel: z.string(),
      orderColumnHeader: z.string(),
      amountColumnHeader: z.string(),
      currencyColumnHeader: z.string(),
      paymentColumnHeader: z.string(),
      dateColumnHeader: z.string(),
      detailsTitle: z.string(),
      detailsDescription: z.string().nullable(),
      linksTitle: z.string(),
      linksLoadingLabel: z.string(),
      noLinksLabel: z.string(),
      searchLabel: z.string().default("Search orders"),
      searchPlaceholder: z.string().default("Order reference or customer"),
      statusFilterLabel: z.string().default("Status"),
      allStatusLabel: z.string().default("All statuses"),
      paidStatusLabel: z.string().default("Paid"),
      cancelledStatusLabel: z.string().default("Cancelled"),
      fulfilledStatusLabel: z.string().default("Fulfilled"),
      unfulfilledStatusLabel: z.string().default("Unfulfilled"),
      currencyFilterLabel: z.string().default("Currency"),
      createdAfterLabel: z.string().default("Created after"),
      createdBeforeLabel: z.string().default("Created before"),
      applyFiltersLabel: z.string().default("Apply filters"),
      clearFiltersLabel: z.string().default("Clear filters"),
      cancelFormCloseLabel: z.string().default("Close"),
      nextPageLabel: z.string().default("Next page"),
      previousPageLabel: z.string().default("Previous page"),
      orderRefLabel: z.string().default("Order reference"),
      statusLabel: z.string().default("Order status"),
      paymentStatusLabel: z.string().default("Payment status"),
      fulfillmentStatusLabel: z.string().default("Fulfillment status"),
      lineItemsTitle: z.string().default("Purchased items"),
      itemLabel: z.string().default("Item"),
      quantityLabel: z.string().default("Quantity"),
      unitPriceLabel: z.string().default("Unit price"),
      lineTotalLabel: z.string().default("Line total"),
      noLineItemsLabel: z.string().default("No line items are available."),
      cancelButtonLabel: z.string().default("Cancel order"),
      cancelReasonLabel: z.string().default("Cancellation reason"),
      cancelConfirmLabel: z.string().default("Cancel this order? This does not issue a refund."),
      cancellingLabel: z.string().default("Cancelling…"),
      fulfillButtonLabel: z.string().default("Mark fulfilled"),
      fulfillmentReferenceLabel: z.string().default("Fulfillment reference"),
      carrierLabel: z.string().default("Carrier"),
      trackingNumberLabel: z.string().default("Tracking number"),
      fulfillConfirmLabel: z.string().default("Mark this order as fulfilled?"),
      fulfillingLabel: z.string().default("Saving fulfillment…"),
      refundButtonLabel: z.string().default("Request refund"),
      refundConfirmLabel: z.string().default("Request a refund for this order?"),
      refundReasonLabel: z.string().default("Refund reason"),
      refundAmountLabel: z.string().default("Refund amount (minor units)"),
      refundingLabel: z.string().default("Submitting refund…"),
      refundFormCloseLabel: z.string().default("Close"),
      actionSuccessLabel: z.string().default("Order updated."),
      reasonRequiredLabel: z
        .string()
        .default("Enter a cancellation reason of at least 3 characters."),
      evidenceRecordsLabel: z.string().default("Order evidence records"),
      partialDetailsLabel: z
        .string()
        .default(
          "This legacy order has a partial snapshot; some totals or items may be unavailable.",
        ),
      staleRevisionLabel: z
        .string()
        .default(
          "The order changed since it was opened. Latest details and results were refreshed.",
        ),
    }),
    description: "Search orders, inspect evidence, and perform eligible order actions",
  },
  CartDrawer: {
    props: z.object({
      title: z.string(),
      openLabel: z.string(),
      closeLabel: z.string(),
      loadingLabel: z.string(),
      emptyLabel: z.string(),
      errorLabel: z.string(),
      subtotalLabel: z.string(),
      removeItemLabel: z.string(),
      decreaseQuantityLabel: z.string(),
      increaseQuantityLabel: z.string(),
      checkoutLabel: z.string(),
      priceUnavailableLabel: z.string(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("CAD"),
    }),
    description: "Accessible cart drawer with item controls and checkout",
  },
  CartSummary: {
    props: z.object({
      title: z.string(),
      checkoutLabel: z.string(),
      viewCartLabel: z.string(),
      hideCartLabel: z.string(),
      loadingLabel: z.string(),
      emptyLabel: z.string(),
      itemLabel: z.string(),
      itemsLabel: z.string(),
      removeItemLabel: z.string(),
      decreaseQuantityLabel: z.string(),
      increaseQuantityLabel: z.string(),
      priceUnavailableLabel: z.string(),
      signInLabel: z.string(),
      signInRequiredLabel: z.string(),
      paymentPendingLabel: z.string(),
      paymentSuccessLabel: z.string(),
      paymentFailedLabel: z.string(),
    }),
  },
  CheckoutButton: {
    props: z.object({
      checkoutLabel: z.string(),
      loadingLabel: z.string(),
      errorLabel: z.string(),
      variant: z.enum(["primary", "outline", "link"]).default("primary"),
    }),
    description: "Configurable checkout action button",
  },
  Hero: {
    props: z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      ctaText: z.string().nullable(),
      imageAlt: z.string().nullable(),
      image: z.string().nullable(),
      ctaAction: z.string().nullable(),
    }),
    description: "Full-width hero banner with title, image, and CTA",
  },
  ProductGrid: {
    props: z.object({
      title: z.string(),
      description: z.string().nullable(),
      minColumnWidthPx: z.number().int().min(180).max(800).default(260),
      gap: z.number().min(0).max(96).default(20),
    }),
    slots: ["default"],
    description: "Responsive grid section for product cards",
  },
  ProductInfo: {
    props: z.object({
      productId: z.string().min(1),
      title: z.string(),
      price: z.number().nonnegative(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("CAD"),
      image: z.string().nullable(),
      imageAlt: z.string().nullable(),
      description: z.unknown().nullable(),
      quantityLabel: z.string(),
      decreaseQuantityLabel: z.string(),
      increaseQuantityLabel: z.string(),
      addToCartLabel: z.string(),
      addingLabel: z.string(),
      addedToCartMessage: z.string(),
      addFailedMessage: z.string(),
      maxQuantity: z.number().int().min(1).max(999).default(99),
    }),
    description: "Product detail with image, price, quantity, and add-to-cart action",
  },
  CollectionPage: {
    props: z.object({
      listingKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      contentType: z.string().min(1),
      collectionSlug: z.string().nullable(),
      pageSize: z.number().int().min(1).max(100),
      currency: z.string().regex(/^[A-Z]{3}$/),
      title: z.string(),
      loadingLabel: z.string(),
      emptyLabel: z.string(),
      errorLabel: z.string(),
      priceUnavailableLabel: z.string(),
      addToCartLabel: z.string(),
      addingLabel: z.string(),
      addedToCartMessage: z.string(),
      addFailedMessage: z.string(),
      ...productListingFields,
    }),
    description: "Published content collection rendered as storefront product cards",
  },
  SearchResults: {
    props: z.object({
      listingKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      contentType: z.string().min(1),
      collectionSlug: z.string().nullable(),
      pageSize: z.number().int().min(1).max(100),
      currency: z.string().regex(/^[A-Z]{3}$/),
      title: z.string(),
      searchPlaceholder: z.string(),
      searchButtonLabel: z.string(),
      loadingLabel: z.string(),
      emptyLabel: z.string(),
      errorLabel: z.string(),
      priceUnavailableLabel: z.string(),
      addToCartLabel: z.string(),
      addingLabel: z.string(),
      addedToCartMessage: z.string(),
      addFailedMessage: z.string(),
      ...productListingFields,
    }),
    description: "Search published content through the tenant storefront API",
  },
  Pagination: {
    props: z.object({
      listingKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      previousLabel: z.string(),
      nextLabel: z.string(),
      pageLabel: z.string(),
    }),
    description: "Previous/next controls for a loaded storefront listing",
  },
  ProductCard: {
    props: z.object({
      addToCart: z.string(),
      adding: z.string(),
      addedToCart: z.string(),
      addFailed: z.string(),
      productId: z.string(),
      title: z.string(),
      price: z.number(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("CAD"),
      image: z.string().nullable(),
      description: z.unknown().nullable(),
    }),
    description: "Product card with image, title, price, and description",
  },
};

export const commerceActionSchemas = {
  addToCart: {
    params: z.object({
      productId: z.string(),
      quantity: z.number().int().min(1).max(999).default(1),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("CAD"),
    }),
    description: "Add product to cart",
  },
  updateCartItem: {
    params: z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(0).max(999),
    }),
    description: "Set a cart item quantity, or remove it with zero",
  },
  loadPublishedContent: {
    params: z.object({
      listingKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      contentType: z.string().min(1),
      collectionSlug: z.string().nullable(),
      query: z.string().nullable(),
      locale: z.string().nullable(),
      limit: z.number().int().min(1).max(100),
      offset: z.number().int().min(0),
      productIdField: z.string().min(1),
      titleField: z.string().min(1),
      priceField: z.string().min(1),
      imageField: z.string().min(1),
      descriptionField: z.string().min(1),
      currency: z.string().regex(/^[A-Z]{3}$/),
    }),
    description: "Load published tenant content into catalog renderer state",
  },
  checkout: {
    description: "Create a hosted checkout session and redirect",
  },
  mergeGuestCart: {
    description: "Claim the guest cart for the signed-in user (also runs on login)",
  },
};
