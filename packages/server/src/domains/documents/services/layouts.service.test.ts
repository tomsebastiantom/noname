import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "../../../shared/domain-error";
import { documentRow, ORG } from "../test-helpers";
import { createLayoutService } from "./layouts.service";

describe("createLayoutService update If-Match", () => {
  it("throws ConflictError when If-Match updatedAt is stale (409 path for editor)", async () => {
    const layout = {
      ...documentRow("layout-1", "layout"),
      key: "home",
      data: { spec: { root: "r", elements: { r: { type: "Stack", props: {}, children: [] } } } },
    };
    layout.updatedAt = new Date("2026-08-05T12:00:00.000Z");

    const storage = {
      findDocumentById: vi.fn(async () => layout),
      updateDocument: vi.fn(),
    };

    const service = createLayoutService(storage as never);

    await expect(
      service.update(
        ORG,
        "layout-1",
        { spec: layout.data.spec as Record<string, unknown> },
        { ifMatchUpdatedAt: "2026-08-05T11:00:00.000Z" },
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(storage.updateDocument).not.toHaveBeenCalled();
  });

  it("updates when If-Match matches updatedAt", async () => {
    const layout = {
      ...documentRow("layout-1", "layout"),
      key: "home",
      data: { spec: { root: "r", elements: { r: { type: "Stack", props: {}, children: [] } } } },
    };
    layout.updatedAt = new Date("2026-08-05T12:00:00.000Z");

    const updated = { ...layout, data: { ...layout.data, spec: { root: "r", elements: {} } } };
    const storage = {
      findDocumentById: vi.fn(async () => layout),
      updateDocument: vi.fn(async () => updated),
    };

    const service = createLayoutService(storage as never);
    const nextSpec = { root: "r", elements: { r: { type: "Stack", props: {}, children: [] } } };

    const result = await service.update(
      ORG,
      "layout-1",
      { spec: nextSpec },
      { ifMatchUpdatedAt: layout.updatedAt.toISOString() },
    );

    expect(result).toBe(updated);
    expect(storage.updateDocument).toHaveBeenCalledOnce();
  });
});
