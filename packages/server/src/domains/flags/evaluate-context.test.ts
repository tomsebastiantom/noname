import { createHash } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { eventBus } from "../../shared/event-bus";
import { ORG_ID_KEY, USER_ID_KEY } from "../../shared/org";
import type { FlagDTO, FlagStorage } from "./ports";
import { registerFlagEvaluateRoutes } from "./routes/evaluate";
import { createFlagService } from "./service";

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
    recordEvaluations: vi.fn(async () => {}),
    listEvaluations: vi.fn(async () => []),
  };
}

describe("flag evaluation subject and context", () => {
  it("uses an explicit global subject when context is absent and persists only its kind", async () => {
    const flag = mockFlag();
    const storage = mockStorage(flag);
    const service = createFlagService(storage);
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);

    const evaluations = await service.evaluate("org-1", {}, ["show_summer_sale"]);

    expect(evaluations).toHaveLength(1);
    expect(storage.recordEvaluations).toHaveBeenCalledWith([
      expect.objectContaining({
        subjectKind: "global",
        schemaId: null,
        variantId: null,
      }),
    ]);
    const record = vi.mocked(storage.recordEvaluations).mock.calls[0]?.[0]?.[0];
    expect(record).not.toHaveProperty("subject");
    expect(record).not.toHaveProperty("subjectKey");
    expect(record).not.toHaveProperty("contextHash");
    const eventPayload = publish.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(eventPayload).toMatchObject({ subjectKind: "global" });
    expect(eventPayload).not.toHaveProperty("subject");
    expect(eventPayload).not.toHaveProperty("contextHash");
    publish.mockRestore();
  });

  it("matches named audiences and typed properties", async () => {
    const audienceFlag = mockFlag({
      targeting: [
        { priority: 0, condition: { type: "audience", key: "recent_buyer" }, value: true },
      ],
    });
    const audienceGroupFlag = mockFlag({
      targeting: [
        {
          priority: 0,
          condition: { type: "audience_group", keys: ["staff", "recent_buyer"] },
          value: true,
        },
      ],
    });
    const propertyFlag = mockFlag({
      targeting: [
        {
          priority: 0,
          condition: { type: "property_match", property: "tier", operator: "eq", value: "gold" },
          value: true,
        },
      ],
    });
    await expect(
      createFlagService(mockStorage(audienceFlag)).evaluate("org-1", {
        audienceKeys: ["recent_buyer"],
      }),
    ).resolves.toMatchObject([{ value: true }]);
    await expect(
      createFlagService(mockStorage(audienceGroupFlag)).evaluate("org-1", {
        audienceKeys: ["recent_buyer"],
      }),
    ).resolves.toMatchObject([{ value: true }]);
    await expect(
      createFlagService(mockStorage(propertyFlag)).evaluate("org-1", {
        contextProperties: { tier: "gold" },
      }),
    ).resolves.toMatchObject([{ value: true }]);
  });

  it.each([
    { kind: "account" as const, key: "account-7" },
    { kind: "session" as const, key: "session-7" },
    { kind: "global" as const, key: "global" },
  ])("uses subject kind and key in stable percentage bucketing: $kind", async (subject) => {
    const material = JSON.stringify([
      "org-1",
      "show_summer_sale",
      subject.kind,
      subject.key,
      "seed-a",
    ]);
    const digest = createHash("sha256").update(material).digest("hex");
    const bucket = Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
    const percent = Math.max(0, Math.min(100, Math.ceil(bucket * 10000) / 100));
    const flag = mockFlag({
      type: "percentage",
      targeting: [
        { priority: 0, condition: { type: "percentage", percent, seed: "seed-a" }, value: true },
      ],
    });
    const service = createFlagService(mockStorage(flag));

    const first = await service.evaluate("org-1", { subject }, [flag.key]);
    const second = await service.evaluate("org-1", { subject }, [flag.key]);
    expect(first[0]?.value).toBe(bucket < percent / 100);
    expect(second[0]?.value).toBe(first[0]?.value);
  });

  it("coerces empty schemaId and variantId to null", async () => {
    const storage = mockStorage(mockFlag());
    const service = createFlagService(storage);

    await service.evaluate("org-1", {
      subject: { kind: "account", key: "account-private" },
      schemaId: "",
      variantId: "",
      contextProperties: {},
      audienceKeys: [],
      orgId: "org-1",
    });

    expect(storage.recordEvaluations).toHaveBeenCalledWith([
      expect.objectContaining({ subjectKind: "account", schemaId: null, variantId: null }),
    ]);
    const serialized = JSON.stringify(vi.mocked(storage.recordEvaluations).mock.calls[0]?.[0]);
    expect(serialized).not.toContain("account-private");
  });

  it("drops non-UUID layout keys before writing UUID scope columns", async () => {
    const storage = mockStorage(mockFlag());
    const service = createFlagService(storage);

    await service.evaluate("org-1", {
      subject: { kind: "account", key: "account-private" },
      schemaId: "home",
      variantId: "recent_buyer",
      contextProperties: { layoutVariant: "recent_buyer" },
      audienceKeys: ["recent_buyer"],
      orgId: "org-1",
    });

    expect(storage.recordEvaluations).toHaveBeenCalledWith([
      expect.objectContaining({ subjectKind: "account", schemaId: null, variantId: null }),
    ]);
  });

  it("rejects legacy segment rules with an actionable migration error", async () => {
    const legacyFlag = mockFlag({
      targeting: [
        { priority: 0, condition: { type: "segment", hash: "opaque" }, value: true } as never,
      ],
    });
    const service = createFlagService(mockStorage(legacyFlag));

    await expect(service.evaluate("org-1", {})).rejects.toThrow(
      /cannot be migrated automatically.*audience/i,
    );
  });
});

describe("flag evaluation route identity boundary", () => {
  function routeApp(userId?: string) {
    const service = {
      evaluate: vi.fn(async () => []),
      evaluateBatch: vi.fn(async () => []),
    } as unknown as Parameters<typeof registerFlagEvaluateRoutes>[1]["service"];
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set(ORG_ID_KEY, "org-1");
      if (userId) c.set(USER_ID_KEY, userId);
      await next();
    });
    registerFlagEvaluateRoutes(app, { service });
    return { app, service };
  }

  it("ignores client account/audience/property claims and falls back to global", async () => {
    const { app, service } = routeApp();
    const response = await app.request("/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          subject: { kind: "account", key: "spoofed-account" },
          audienceKeys: ["admin"],
          contextProperties: { tier: "gold" },
          schemaId: "00000000-0000-0000-0000-000000000001",
          variantId: "00000000-0000-0000-0000-000000000002",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(service.evaluate).toHaveBeenCalledWith(
      "org-1",
      {
        orgId: "org-1",
        subject: { kind: "global", key: "global" },
        audienceKeys: [],
        contextProperties: {},
        schemaId: null,
        variantId: null,
      },
      undefined,
    );
  });

  it("uses only server-authenticated user identity for account bucketing", async () => {
    const { app, service } = routeApp("verified-account");
    await app.request("/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: { kind: "account", key: "attacker" },
        audienceKeys: ["admin"],
      }),
    });

    expect(service.evaluate).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        subject: { kind: "account", key: "verified-account" },
        audienceKeys: [],
      }),
      undefined,
    );
  });

  it("allows an anonymous session rollout key but rejects hash/segment aliases", async () => {
    const { app, service } = routeApp();
    const sessionResponse = await app.request("/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionKey: "anonymous-session" }),
    });
    expect(sessionResponse.status).toBe(200);
    expect(service.evaluate).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ subject: { kind: "session", key: "anonymous-session" } }),
      undefined,
    );

    const rejected = await app.request("/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: { contextHash: "legacy" } }),
    });
    expect(rejected.status).toBe(400);
    expect(service.evaluate).toHaveBeenCalledTimes(1);
  });
});
