import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["./packages/**/*.test.ts"],
    env: {
      MANIFEST_STORE: "memory",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["./packages/server/src/**/*.ts"],
      exclude: ["./packages/server/src/**/*.test.ts", "./packages/server/src/drizzle.ts"],
    },
  },
});
