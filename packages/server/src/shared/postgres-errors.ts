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
