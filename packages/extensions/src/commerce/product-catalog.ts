const products = new Map<
  string,
  { title: string; price: number; currency?: string; image?: string | null }
>();

export function cacheProduct(product: {
  productId: string;
  title: string;
  price: number;
  currency?: string;
  image?: string | null;
}): void {
  products.set(product.productId, product);
}

export function getCachedProduct(productId: string) {
  return products.get(productId);
}

export function formatProductPrice(price: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(price);
}
