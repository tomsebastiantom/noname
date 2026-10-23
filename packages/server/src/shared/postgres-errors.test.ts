import { describe, expect, it, vi } from "vitest";
import { isPostgresUniqueViolation, retryOnUniqueViolation } from "./postgres-errors";

/**
 * `document_ops.server_version` is computed as `max(server_version) + 1`, so two concurrent writers can
 * compute the same value. The unique index turns that race into a 23505, and this helper retries so the
 * loser recomputes a fresh number instead of failing the write.
 *
 * The dangerous failure mode is retrying too much: a *genuine* duplicate must still surface, so the helper
 * rethrows after `attempts` and rethrows immediately for any non-unique error.
 */

/** Mirrors what drizzle-orm/postgres-js actually throws: the SQLSTATE sits on `cause`. */
function uniqueViolation(): Error {
  return Object.assign(new Error("Failed query: insert into document_ops"), {
    cause: Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    }),
  });
}

describe("isPostgresUniqueViolation", () => {
  it("detects the code on the error itself", () => {
    expect(isPostgresUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("detects the code nested in cause, which is how drizzle wraps it", () => {
    expect(isPostgresUniqueViolation(uniqueViolation())).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isPostgresUniqueViolation(new Error("connection refused"))).toBe(false);
    expect(isPostgresUniqueViolation({ code: "23503" })).toBe(false);
    expect(isPostgresUniqueViolation(null)).toBe(false);
  });
});

describe("retryOnUniqueViolation", () => {
  it("returns immediately when the operation succeeds", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(retryOnUniqueViolation(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a unique violation and succeeds once a fresh version is available", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt += 1;
      if (attempt < 3) throw uniqueViolation();
      return `version-${attempt}`;
    });

    await expect(retryOnUniqueViolation(fn)).resolves.toBe("version-3");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry an unrelated error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("connection refused");
    });

    await expect(retryOnUniqueViolation(fn)).rejects.toThrow("connection refused");
    // Retrying a dead connection would only multiply the latency of a failure that cannot heal here.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured attempts instead of looping forever", async () => {
    const fn = vi.fn(async () => {
      throw uniqueViolation();
    });

    let caught: unknown;
    try {
      await retryOnUniqueViolation(fn, 4);
    } catch (error) {
      caught = error;
    }
    // The original error surfaces, not a wrapper: the caller can still tell it was a 23505.
    expect(isPostgresUniqueViolation(caught)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
