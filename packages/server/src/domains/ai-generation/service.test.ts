import { describe, expect, it, vi } from "vitest";
import { createAIPipeline } from "./service";

describe("createAIPipeline", () => {
  it("persists each LLM call to storage", async () => {
    const insert = vi.fn(async () => undefined);
    const pipeline = createAIPipeline({
      secrets: {
        resolveLLMProvider: vi.fn(async () => ({
          generate: vi.fn(async () => ({
            response: { spec: { root: "main" } },
            model: "gpt-test",
            tokens: 42,
          })),
        })),
      },
      storage: { insert },
    });

    const result = await pipeline.generateLayout("org-1", "build hero", { page: "home" });

    expect(result.model).toBe("gpt-test");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        prompt: "build hero",
        model: "gpt-test",
        tokens: 42,
        targetType: "layout",
      }),
    );
  });
});
