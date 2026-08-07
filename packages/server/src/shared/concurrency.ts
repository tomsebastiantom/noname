/**
 * Maps over `items` with at most `limit` in-flight calls to `fn` at once.
 *
 * Plain `Promise.all(items.map(fn))` is fine for small/bounded lists, but for external-API
 * fan-out sized by tenant data (e.g. one HTTP call per team member) it either serializes
 * unnecessarily (a `for` loop) or fires unboundedly many concurrent requests at a third party
 * (unlimited `Promise.all`), which risks tripping that third party's rate limits under load.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
