/**
 * Reference-first deep equal for spec values. Spec trees are treated as
 * immutable, so unchanged branches share references and compare O(1) —
 * unlike `JSON.stringify(a) === JSON.stringify(b)` guards that serialize
 * whole subtrees on every keystroke. Dependency-free: hooks can use this
 * without linking Automerge.
 */
export function specValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => specValueEqual(item, (b as unknown[])[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) return false;
  return aKeys.every((key) => key in bRecord && specValueEqual(aRecord[key], bRecord[key]));
}
