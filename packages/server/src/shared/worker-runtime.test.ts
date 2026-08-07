import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workerConcurrency, workersEnabled } from "./worker-runtime";

const ENV_KEYS = ["RUN_WORKERS", "TEST_WORKER_CONCURRENCY"];

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("worker-runtime", () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  describe("workersEnabled", () => {
    it("defaults to true when RUN_WORKERS is unset", () => {
      expect(workersEnabled()).toBe(true);
    });

    it("is false when RUN_WORKERS=false", () => {
      process.env.RUN_WORKERS = "false";
      expect(workersEnabled()).toBe(false);
    });

    it("is false when RUN_WORKERS=0", () => {
      process.env.RUN_WORKERS = "0";
      expect(workersEnabled()).toBe(false);
    });

    it("is true when RUN_WORKERS=true or 1", () => {
      process.env.RUN_WORKERS = "true";
      expect(workersEnabled()).toBe(true);
      process.env.RUN_WORKERS = "1";
      expect(workersEnabled()).toBe(true);
    });

    it("treats an empty string the same as unset", () => {
      process.env.RUN_WORKERS = "";
      expect(workersEnabled()).toBe(true);
    });
  });

  describe("workerConcurrency", () => {
    it("falls back to the default when the env var is unset", () => {
      expect(workerConcurrency("TEST_WORKER_CONCURRENCY", 4)).toBe(4);
    });

    it("uses the env var override when set to a valid positive number", () => {
      process.env.TEST_WORKER_CONCURRENCY = "12";
      expect(workerConcurrency("TEST_WORKER_CONCURRENCY", 4)).toBe(12);
    });

    it("falls back to the default for non-numeric, zero, or negative overrides", () => {
      for (const raw of ["not-a-number", "0", "-3"]) {
        process.env.TEST_WORKER_CONCURRENCY = raw;
        expect(workerConcurrency("TEST_WORKER_CONCURRENCY", 4)).toBe(4);
      }
    });

    it("floors a fractional override", () => {
      process.env.TEST_WORKER_CONCURRENCY = "3.7";
      expect(workerConcurrency("TEST_WORKER_CONCURRENCY", 4)).toBe(3);
    });
  });
});
