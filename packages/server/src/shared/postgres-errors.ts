/** Postgres unique violation via drizzle-orm/postgres-js (DrizzleQueryError.cause.code). */
export function isPostgresUniqueViolation(err: unknown): boolean {
  const candidates: unknown[] = [err];
  if (typeof err === "object" && err !== null && "cause" in err) {
    candidates.push((err as { cause: unknown }).cause);
  }
  for (const candidate of candidates) {
    if (typeof candidate === "object" && candidate !== null && "code" in candidate) {
      if ((candidate as { code: string }).code === "23505") return true;
    }
  }
  return false;
}

/**
 * Retries `fn` when it fails with a unique violation.
 *
 * Only valid where a unique conflict is *expected to be transient*. The canonical case is a computed
 * sequence (`SELECT max(n) + 1`): two concurrent writers read the same maximum, one insert wins, and the
 * loser's retry recomputes a fresh value. It must not be used to swallow a genuinely duplicate insert —
 * after `attempts` the error is rethrown, so a real constraint violation still surfaces.
 */
export async function retryOnUniqueViolation<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isPostgresUniqueViolation(error) || attempt === attempts) throw error;
      lastError = error;
    }
  }
  // Unreachable: the loop either returns or throws. Kept so the return type is exhaustive.
  throw lastError;
}
