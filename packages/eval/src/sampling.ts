import { hashValue } from "./cache";

/**
 * Deterministic, rotating route sample.
 *
 * The same tenant + route + day always lands in the same sample, so a failure is reproducible; the day is part
 * of the hash so a permanently sampled-out route is eventually checked. Home is always included: a broken home
 * page is never an acceptable sample.
 */
export function deterministicSample(
  routes: string[],
  options: { tenantSlug: string; limit: number; day?: string; always?: string[] },
): string[] {
  const sorted = [...routes].sort();
  if (options.limit <= 0 || sorted.length <= options.limit) return sorted;

  const day = options.day ?? new Date().toISOString().slice(0, 10);
  const always = new Set(options.always ?? ["/"]);
  const mandatory = sorted.filter((route) => always.has(route));
  const rest = sorted.filter((route) => !always.has(route));

  const ranked = rest
    .map((route) => ({ route, rank: hashValue({ tenant: options.tenantSlug, route, day }) }))
    .sort((a, b) => a.rank.localeCompare(b.rank));

  const capacity = Math.max(0, options.limit - mandatory.length);
  return [
    ...new Set([...mandatory, ...ranked.slice(0, capacity).map((entry) => entry.route)]),
  ].sort();
}
