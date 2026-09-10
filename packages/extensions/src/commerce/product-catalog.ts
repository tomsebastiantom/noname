const products = new Map<string, { title: string; price: number; currency?: string }>();

export function cacheProduct(product: { productId: string; title: string; price: number; currency?: string }): void {
  products.set(product.productId, product);
}

export function getCachedProduct(productId: string) {
  return products.get(productId);
}
