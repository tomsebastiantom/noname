// Dot-path override application for layout variant inheritance.
//
// A non-default layout variant stores ONLY overrides — a flat map keyed by
// dot-path into the default spec (e.g. { "sections.hero.columns": 1 }). The
// `resolve` endpoint applies these onto the default and reports any override
// paths that no longer resolve (because the default was restructured), so the
// merchant gets a conflict warning instead of a silent miss.

export function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    const next = cursor[key];
    if (next && typeof next === "object" && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
    }
  }
  cursor[keys[keys.length - 1]!] = value;
}

export function pathExists(obj: unknown, path: string): boolean {
  return getByPath(obj, path) !== undefined;
}

export interface OverrideResult {
  spec: Record<string, unknown>;
  conflicts: string[];
}

// Applies a flat dot-path override map onto the default spec. Returns a NEW
// spec (does not mutate the input) plus any conflict paths that could not be
// resolved against the current default.
export function applyOverrides(
  defaultSpec: Record<string, unknown>,
  overrides: Record<string, unknown>,
): OverrideResult {
  const spec = deepClone(defaultSpec);
  const conflicts: string[] = [];

  for (const [path, value] of Object.entries(overrides)) {
    if (!pathExists(spec, path)) {
      conflicts.push(path);
      continue;
    }
    setByPath(spec, path, value);
  }

  return { spec, conflicts };
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
