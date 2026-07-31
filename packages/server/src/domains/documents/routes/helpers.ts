import type { LayoutFilters } from "../ports";

export function layoutFiltersFrom(query: Record<string, string | undefined>): LayoutFilters {
  return {
    templateName: query.templateName || undefined,
    segment: query.segment || undefined,
    status: (query.status as LayoutFilters["status"]) || undefined,
  };
}

export function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function parseFocalPoint(v: unknown): { x: number; y: number } | null {
  if (typeof v !== "string") return null;
  const parts = v.split(",");
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
