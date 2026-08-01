import type { AdminNavItem } from "./AdminNav";

export function resolveNavItems(
  items: { id: string; href: string }[],
  labelMap: Record<string, string>,
): AdminNavItem[] {
  return items.map((item) => ({
    id: item.id,
    href: item.href,
    label: labelMap[item.id] ?? item.id,
  }));
}
