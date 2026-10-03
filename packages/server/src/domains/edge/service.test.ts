import { describe, expect, it, vi } from "vitest";
import type { AnalyticsService } from "../analytics/ports";
import type { AudienceExperienceDeliveryService } from "../audiences/experience-attribution";
import type { AudienceMembershipService } from "../audiences/membership";
import type {
  ContentDocumentService,
  LayoutDocumentService,
  PageTreeService,
  TenantSettingsService,
} from "../documents/ports";
import type { FlagService } from "../flags/ports";
import { createEdgeService } from "./service";

const sessionId = "7f9ecf82-e3be-4fca-a3e7-4ccae491a530";
const decisionId = "0ac94ef7-22b0-4a0d-8e5b-56c0d8a58f5c";
const membership = {
  orgId: "org-1",
  userId: "user-1",
  audienceKey: "recent_buyer",
  sourceActivityId: "commerce.order.paid:cart-1",
  definitionVersion: 3,
  assignedAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: null,
  revokedAt: null,
};
const match = {
  membership,
  binding: {
    id: "9e348887-3b25-4da0-b811-3ee79c10ccf9",
    orgId: "org-1",
    audienceKey: "recent_buyer",
    version: 2,
    pageKey: "/products/sku-1",
    locale: "en-US",
    schemaId: "product-layout",
    variantId: "summer-sale",
    goalEvent: "commerce.order.paid",
    attributionWindowDays: 30,
    status: "active",
    createdBy: "admin-1",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    activatedAt: new Date("2026-09-01T00:00:00Z"),
  },
};
const dimensions = {
  decisionId,
  sessionId,
  audienceKey: "recent_buyer",
  audienceDefinitionVersion: 3,
  bindingId: match.binding.id,
  bindingVersion: 2,
  pageKey: "/products/sku-1",
  locale: "en-US",
  schemaId: "product-layout",
  variantId: "summer-sale",
};

function createService() {
  const resolvedVariants: string[] = [];
  const layout = {
    async resolve(_orgId: string, template: string, variant: string) {
      resolvedVariants.push(variant);
      return {
        templateName: template,
        segment: variant,
        version: 1,
        spec: { type: "Page", props: { variant } },
        contentRef: null,
        renderAs: "standalone" as const,
        shellRef: null,
        conflicts: [],
      };
    },
  } as unknown as LayoutDocumentService;
  const content = { resolve: vi.fn() } as unknown as ContentDocumentService;
  const tenantSettings = {
    async get() {
      return { defaultLocale: "en-US" };
    },
  } as unknown as TenantSettingsService;
  const pages = {
    async resolveByUrl() {
      return {
        pageId: "page-id-not-the-route-key",
        layoutRef: "product",
        contentRef: "",
        locale: "en-US",
      };
    },
  } as unknown as PageTreeService;
  const audiences = {
    getActiveMemberships: vi.fn(async () => [membership]),
    resolveExperience: vi.fn(async () => match),
    createExperienceDecision: vi.fn(async () => dimensions),
    markExperienceDecisionRendered: vi.fn(async () => ({ dimensions, newlyRendered: true })),
  } as unknown as AudienceMembershipService & AudienceExperienceDeliveryService;
  const flags = {
    evaluate: vi.fn(async () => [{ flagKey: "sale", value: true }]),
  } as unknown as FlagService;
  const analytics = {
    ingestServerEvent: vi.fn(async () => undefined),
  } as unknown as AnalyticsService;

  return {
    service: createEdgeService(layout, content, tenantSettings, audiences, flags, analytics, pages),
    audiences,
    flags,
    analytics,
    resolvedVariants,
  };
}

describe("Edge verified experience resolution", () => {
  it("uses a normalized route page key, records a decision, and emits trusted served attribution", async () => {
    const { service, audiences, flags, analytics } = createService();
    const result = await service.getSchema("org-1", {
      url: "https://shop.example/products/sku-1?ref=email",
      verifiedUserId: "user-1",
      sessionId,
    });

    expect(audiences.resolveExperience).toHaveBeenCalledWith("org-1", "user-1", {
      pageKey: "/products/sku-1",
      locale: "en-US",
    });
    expect(audiences.createExperienceDecision).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      sessionId,
      match,
    );
    expect(result.experience).toEqual({
      audienceKey: "recent_buyer",
      audienceDefinitionVersion: 3,
      bindingId: match.binding.id,
      bindingVersion: 2,
      decisionId,
      pageKey: "/products/sku-1",
      locale: "en-US",
      schemaId: "product-layout",
      variantId: "summer-sale",
    });
    expect(flags.evaluate).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        subject: { kind: "account", key: "user-1" },
        audienceKeys: ["recent_buyer"],
        contextProperties: {
          pageKey: "/products/sku-1",
          locale: "en-US",
          layoutVariant: "summer-sale",
        },
        schemaId: "product-layout",
        variantId: null,
      }),
    );
    expect(analytics.ingestServerEvent).toHaveBeenCalledWith(
      "experience.served",
      expect.objectContaining({ orgId: "org-1", decisionId, bindingId: match.binding.id }),
    );
  });

  it("does not serve a personalized variant without a valid session decision context", async () => {
    const { service, audiences, resolvedVariants } = createService();
    const result = await service.getSchema("org-1", {
      url: "https://shop.example/products/sku-1",
      verifiedUserId: "user-1",
      sessionId: "not-a-uuid",
    });

    expect(result.experience).toBeNull();
    expect(resolvedVariants).toContain("default");
    expect(audiences.createExperienceDecision).not.toHaveBeenCalled();
  });

  it("accepts a rendered decision only through server-stored dimensions", async () => {
    const { service, audiences, analytics } = createService();

    await expect(
      service.recordExperienceRendered("org-1", "user-1", sessionId, decisionId),
    ).resolves.toBe(true);
    expect(audiences.markExperienceDecisionRendered).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      sessionId,
      decisionId,
    );
    expect(analytics.ingestServerEvent).toHaveBeenCalledWith(
      "experience.rendered",
      expect.objectContaining({ orgId: "org-1", decisionId, audienceKey: "recent_buyer" }),
    );
  });
});
