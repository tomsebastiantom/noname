import { describe, expect, it, vi } from "vitest";
import { createFlagService } from "./service";
import type { FlagDTO, FlagStorage } from "./ports";

function mockFlag(overrides: Partial<FlagDTO> = {}): FlagDTO {
  return {
    id: "flag-1",
    orgId: "org-1",
    key: "show_summer_sale",
    type: "boolean",
    description: "",
    defaultValue: false,
    targeting: [{ priority: 0, condition: { type: "always" }, value: true }],
    status: "active",
    schemaId: null,
    variantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockStorage(flag: FlagDTO): FlagStorage {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByKey: vi.fn(),
    list: vi.fn(async () => [flag]),
    update: vi.fn(),
    archive: vi.fn(),
    recordEvaluation: vi.fn(async () => {}),
    listEvaluations: vi.fn(async () => []),
  };
}

describe("flag evaluate context normalization", () => {
  it("defaults missing contextHash when recording evaluation", async () => {
    const flag = mockFlag();
    const storage = mockStorage(flag);
    const service = createFlagService(storage);

    const evaluations = await service.evaluate("org-1", {}, ["show_summer_sale"]);

    expect(evaluations).toHaveLength(1);
    expect(storage.recordEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        contextHash: "default",
        schemaId: null,
        variantId: null,
      }),
    );
  });

  it("coerces empty schemaId to null for Postgres uuid columns", async () => {
    const flag = mockFlag();
    const storage = mockStorage(flag);
    const service = createFlagService(storage);

    await service.evaluate("org-1", {
      contextHash: "seg-a",
      schemaId: "",
      variantId: "",
      contextProperties: {},
      orgId: "org-1",
    });

    expect(storage.recordEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        contextHash: "seg-a",
        schemaId: null,
        variantId: null,
      }),
    );
  });
});
