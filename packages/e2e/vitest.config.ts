import { defineConfig } from "vitest/config";

/**
 * E2E suite — runs against the **real** local stack (API :3000, edge :8787, client :5173, ZITADEL :8080).
 *
 * Deliberately separate from `pnpm test`: unit tests are hermetic, these need infra, so they must never run in CI
 * without a stack. One file at a time, long timeouts, no retries — a flaky e2e that retries hides the bug it found.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.e2e.ts"],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
    retry: 0,
  },
});
