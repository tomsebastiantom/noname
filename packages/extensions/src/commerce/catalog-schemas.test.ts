import { describe, expect, it } from "vitest";
import { commerceActionSchemas, commerceComponentSchemas } from "./catalog-schemas";
import { commerceComponents } from "./components";
import { formatMinorAmount, formatProductPrice } from "./product-catalog";

describe("Commerce storefront component catalog", () => {
  it("accepts flat ProductGrid props and rejects unsafe sizing values", () => {
    const parsed = commerceComponentSchemas.ProductGrid.props.parse({
      title: "Featured products",
      description: null,
    });

    expect(parsed).toMatchObject({
      title: "Featured products",
      description: null,
      minColumnWidthPx: 260,
      gap: 20,
    });
    expect(
      commerceComponentSchemas.ProductGrid.props.safeParse({
        title: "Featured products",
        description: null,
        minColumnWidthPx: 20,
      }).success,
    ).toBe(false);
  });

  it("validates ProductInfo details and quantity copy as flat props", () => {
    const parsed = commerceComponentSchemas.ProductInfo.props.parse({
      productId: "demo-sneakers",
      title: "Blue Sneakers",
      price: 99.99,
      currency: "CAD",
      image: null,
      imageAlt: null,
      description: null,
      quantityLabel: "Quantity",
      decreaseQuantityLabel: "Decrease quantity",
      increaseQuantityLabel: "Increase quantity",
      addToCartLabel: "Add to Cart",
      addingLabel: "Adding…",
      addedToCartMessage: "Added to cart",
      addFailedMessage: "Could not add to cart",
    });

    expect(parsed.maxQuantity).toBe(99);
    expect(
      commerceComponentSchemas.ProductInfo.props.safeParse({
        ...parsed,
        currency: "Canadian Dollars",
      }).success,
    ).toBe(false);
    expect(
      commerceComponentSchemas.ProductInfo.props.safeParse({ ...parsed, price: -1 }).success,
    ).toBe(false);
  });

  it("validates cart drawer, checkout variants, collection/search listings, and pagination props", () => {
    const listing = {
      listingKey: "all-products",
      contentType: "product",
      collectionSlug: null,
      pageSize: 12,
      currency: "CAD",
      productIdField: "productId",
      titleField: "title",
      priceField: "price",
      imageField: "image",
      descriptionField: "description",
      title: "All products",
      loadingLabel: "Loading…",
      emptyLabel: "No products",
      errorLabel: "Could not load products",
      priceUnavailableLabel: "Price unavailable",
      addToCartLabel: "Add to Cart",
      addingLabel: "Adding…",
      addedToCartMessage: "Added",
      addFailedMessage: "Failed",
    };
    expect(commerceComponentSchemas.CollectionPage.props.parse(listing)).toMatchObject({
      listingKey: "all-products",
      contentType: "product",
      pageSize: 12,
    });
    expect(
      commerceComponentSchemas.SearchResults.props.parse({
        ...listing,
        searchPlaceholder: "Search products",
        searchButtonLabel: "Search",
      }),
    ).toMatchObject({ searchPlaceholder: "Search products" });
    expect(
      commerceComponentSchemas.Pagination.props.parse({
        listingKey: "all-products",
        previousLabel: "Previous",
        nextLabel: "Next",
        pageLabel: "Page",
      }),
    ).toMatchObject({ listingKey: "all-products" });
    expect(
      commerceComponentSchemas.CheckoutButton.props.safeParse({
        checkoutLabel: "Checkout",
        loadingLabel: "Loading",
        errorLabel: "Failed",
        variant: "danger",
      }).success,
    ).toBe(false);
    expect(
      commerceComponentSchemas.CartDrawer.props.safeParse({
        title: "Cart",
        openLabel: "Open",
        closeLabel: "Close",
        loadingLabel: "Loading",
        emptyLabel: "Empty",
        errorLabel: "Error",
        subtotalLabel: "Subtotal",
        removeItemLabel: "Remove",
        decreaseQuantityLabel: "Decrease",
        increaseQuantityLabel: "Increase",
        checkoutLabel: "Checkout",
        priceUnavailableLabel: "Unavailable",
        currency: "CAD",
      }).success,
    ).toBe(true);
  });

  it("registers implementations for the new storefront components", () => {
    expect(commerceComponents).toEqual(
      expect.objectContaining({
        CartDrawer: expect.any(Function),
        CheckoutButton: expect.any(Function),
        CollectionPage: expect.any(Function),
        SearchResults: expect.any(Function),
        Pagination: expect.any(Function),
      }),
    );
  });

  it("constrains the published-content action payload", () => {
    expect(
      commerceActionSchemas.loadPublishedContent.params.parse({
        listingKey: "home-products",
        contentType: "product",
        collectionSlug: null,
        query: null,
        locale: null,
        limit: 12,
        offset: 0,
        productIdField: "productId",
        titleField: "title",
        priceField: "price",
        imageField: "image",
        descriptionField: "description",
        currency: "CAD",
      }),
    ).toBeDefined();
    expect(
      commerceActionSchemas.loadPublishedContent.params.safeParse({ listingKey: "bad/path" })
        .success,
    ).toBe(false);
  });

  it("formats prices using the product currency and locale", () => {
    const formatted = formatProductPrice(99.99, "CAD", "en-CA");
    expect(formatted).toContain("CAD");
    expect(formatted).toContain("99.99");
  });

  it("formats minor amounts using the order currency exponent", () => {
    expect(formatMinorAmount(1234, "CAD", 2, "en-CA")).toContain("12.34");
    expect(formatMinorAmount(1234, "JPY", 0, "en-US")).toContain("1,234");
    expect(formatMinorAmount(12345, "KWD", 3, "en-US")).toContain("12.345");
  });

  it("keeps existing seeded OrdersAdmin props compatible with defaults for new controls", () => {
    const parsed = commerceComponentSchemas.OrdersAdmin.props.parse({
      title: "Orders",
      description: null,
      loadingLabel: "Loading orders…",
      emptyLabel: "No paid orders yet.",
      refreshLabel: "Refresh",
      refreshingLabel: "Refreshing…",
      forbiddenLabel: "Orders are unavailable.",
      orderColumnHeader: "Order",
      amountColumnHeader: "Amount",
      currencyColumnHeader: "Currency",
      paymentColumnHeader: "Payment",
      dateColumnHeader: "Paid at",
      detailsTitle: "Order evidence",
      detailsDescription: null,
      linksTitle: "Related evidence",
      linksLoadingLabel: "Loading evidence…",
      noLinksLabel: "No links.",
    });

    expect(parsed.searchLabel).toBe("Search orders");
    expect(parsed.cancelFormCloseLabel).toBe("Close");
    expect(parsed.nextPageLabel).toBe("Next page");
    expect(parsed.unfulfilledStatusLabel).toBe("Unfulfilled");
    expect(parsed.partialDetailsLabel).toContain("partial snapshot");
    expect(parsed.staleRevisionLabel).toContain("order changed");
  });
});
