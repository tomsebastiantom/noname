import { afterEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../shared/event-bus";
import { recordEvaluation, recordEvaluations } from "./evaluation";
import { FlagEvents } from "./events";
import type { EvaluationResult, FlagDTO, FlagEvaluationContext, FlagStorage } from "./ports";

/**
 * S12, second half: the `flag.evaluated` publish used to fire once per flag. `eventBus.publish` fans
 * out to Redis unconditionally — it never asks whether anything subscribes — so evaluating N flags in
 * one request cost N Redis publishes. The event has no subscribers anywhere, so batching it changes a
 * published contract that nothing consumes; these tests pin the new shape so a future consumer sees
 * `evaluations` as an array rather than discovering it at runtime.
 */

function flag(id: string, key: string): FlagDTO {
  return {
    id,
    orgId: "org-1",
    key,
    type: "boolean",
    description: "",
    defaultValue: false,
    targeting: [],
    status: "active",
    schemaId: null,
    variantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const ctx = { subject: { kind: "user" }, schemaId: null, variantId: null } as FlagEvaluationContext;
const result: EvaluationResult = { value: true, reason: "default", matchedRule: null };

function storageStub(): FlagStorage {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByKey: vi.fn(),
    list: vi.fn(async () => []),
    update: vi.fn(),
    archive: vi.fn(),
    recordEvaluation: vi.fn(async () => {}),
    recordEvaluations: vi.fn(async () => {}),
    listEvaluations: vi.fn(async () => []),
  } as unknown as FlagStorage;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("flag.evaluated publishing", () => {
  it("publishes once for a whole evaluation set rather than once per flag", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const storage = storageStub();

    await recordEvaluations(storage, [
      { flag: flag("f1", "a"), ctx, result },
      { flag: flag("f2", "b"), ctx, result },
      { flag: flag("f3", "c"), ctx, result },
    ]);

    expect(publish).toHaveBeenCalledTimes(1);
    const [eventName, payload] = publish.mock.calls[0] ?? [];
    expect(eventName).toBe(FlagEvents.EVALUATED);
    const evaluations = (payload as { evaluations: { flagKey: string }[] }).evaluations;
    // The point: three flags, one Redis publish.
    expect(evaluations).toHaveLength(3);
    expect(evaluations.map((entry) => entry.flagKey)).toEqual(["a", "b", "c"]);
  });

  it("keeps a single evaluation a one-element batch, so the shape does not vary by call site", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const storage = storageStub();

    await recordEvaluation(storage, flag("f1", "a"), ctx, result);

    expect(publish).toHaveBeenCalledTimes(1);
    const payload = publish.mock.calls[0]?.[1] as { evaluations: unknown[] };
    expect(payload.evaluations).toHaveLength(1);
  });

  it("publishes nothing when no flag was evaluated", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);

    await recordEvaluations(storageStub(), []);

    expect(publish).not.toHaveBeenCalled();
  });
});
