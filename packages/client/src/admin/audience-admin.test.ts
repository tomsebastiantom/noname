import { PERMISSIONS } from "@noname/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canAccessAdminRoute } from "../auth/admin-routes";
import { platformTemplateFromPath } from "../platform-routes";
import {
  audienceListViewState,
  buildAudienceCondition,
  buildAudienceExpiry,
  buildExperienceBinding,
  canActivateAudienceVersion,
  formatAttributionWindowDays,
  isAggregateAudienceMetrics,
  isRegisteredPredicate,
} from "./audience-authoring";
import type { RegisteredActivityType } from "./audiences";
import { createAudienceVersion, listActivityTypes, validateAudienceVersion } from "./audiences";

const paidActivity: RegisteredActivityType = {
  type: "commerce.order.paid",
  version: 1,
  fields: {
    "order.status": { type: "string", operators: ["equals", "notEquals", "in", "exists"] },
    "order.total": { type: "number", operators: ["gt", "gte", "lt", "lte"] },
  },
};

describe("Audience admin surface", () => {
  it("guards audience authoring with TENANT_MANAGE and keeps metrics behind ANALYTICS_VIEW", () => {
    const tenantManager = {
      userId: "tenant-admin",
      permissions: [PERMISSIONS.TENANT_MANAGE],
      roles: [],
      requireMfaForAdmin: false,
      mfaEnrolled: true,
    };
    const analyst = {
      userId: "analyst",
      permissions: [PERMISSIONS.ANALYTICS_VIEW],
      roles: [],
      requireMfaForAdmin: false,
      mfaEnrolled: true,
    };
    expect(canAccessAdminRoute(tenantManager, "audiences")).toBe(true);
    expect(canAccessAdminRoute(analyst, "audiences")).toBe(false);
    expect(canAccessAdminRoute(tenantManager, "analytics")).toBe(false);
    expect(canAccessAdminRoute(analyst, "analytics")).toBe(true);
    expect(platformTemplateFromPath("/admin/settings/audiences")).toBe("admin_audiences");
  });

  it("renders loading, empty and populated-list states distinctly", () => {
    expect(audienceListViewState(true, 0)).toBe("loading");
    expect(audienceListViewState(false, 0)).toBe("empty");
    expect(audienceListViewState(false, 2)).toBe("ready");
  });

  it("rejects unregistered fields and operators rather than authoring arbitrary expressions", () => {
    expect(isRegisteredPredicate(paidActivity, "order.status", "equals")).toBe(true);
    expect(isRegisteredPredicate(paidActivity, "customer.email", "equals")).toBe(false);
    expect(isRegisteredPredicate(paidActivity, "order.status", "regex")).toBe(false);
    expect(() =>
      buildAudienceCondition({
        activity: paidActivity,
        field: "customer.email",
        operator: "equals",
        value: "x@y.test",
      }),
    ).toThrow(/registered activity field/);
    expect(() =>
      buildAudienceCondition({
        activity: paidActivity,
        field: "order.status",
        operator: "regex",
        value: "paid",
      }),
    ).toThrow(/registered activity field/);
  });

  it("authors typed conditions, explicit membership action/expiry, and only activates validated drafts", () => {
    expect(
      buildAudienceCondition({
        activity: paidActivity,
        field: "order.total",
        operator: "gte",
        value: "50.5",
      }),
    ).toEqual({
      field: "order.total",
      operator: "gte",
      value: 50.5,
    });
    expect(
      buildAudienceCondition({
        activity: paidActivity,
        field: "order.status",
        operator: "in",
        value: "paid, refunded",
      }),
    ).toEqual({
      field: "order.status",
      operator: "in",
      value: ["paid", "refunded"],
    });
    expect(buildAudienceExpiry(30)).toEqual({ afterMs: 30 * 24 * 60 * 60 * 1000 });
    expect(canActivateAudienceVersion("draft", false)).toBe(false);
    expect(canActivateAudienceVersion("draft", true)).toBe(true);
    expect(canActivateAudienceVersion("active", true)).toBe(false);
  });

  it("normalizes page scopes and creates finite event attribution bindings", () => {
    expect(
      buildExperienceBinding({
        pageKey: " products//featured/ ",
        locale: "en-US",
        schemaId: "published-layout-id",
        variantId: "default",
        goalEvent: "commerce.order.refunded",
        attributionDays: 30,
        approvedGoalEvents: ["commerce.order.refunded"],
      }),
    ).toEqual({
      pageKey: "/products/featured",
      locale: "en-US",
      schemaId: "published-layout-id",
      variantId: "default",
      goalEvent: "commerce.order.refunded",
      attributionWindowDays: 30,
    });
    expect(() =>
      buildExperienceBinding({
        pageKey: "/products",
        locale: "en-US",
        schemaId: "layout",
        variantId: "default",
        goalEvent: "commerce.order.refunded",
        attributionDays: 31,
        approvedGoalEvents: ["commerce.order.refunded"],
      }),
    ).toThrow(/1 and 30 days/);
    expect(() =>
      buildExperienceBinding({
        pageKey: "/products/../account",
        locale: "",
        schemaId: "layout",
        variantId: "default",
        goalEvent: "commerce.order.refunded",
        attributionDays: 30,
        approvedGoalEvents: ["commerce.order.refunded"],
      }),
    ).toThrow(/normalized page/);
    expect(() =>
      buildExperienceBinding({
        pageKey: "/products",
        locale: "",
        schemaId: "layout",
        variantId: "default",
        goalEvent: "made.up.event",
        attributionDays: 30,
        approvedGoalEvents: ["commerce.order.refunded"],
      }),
    ).toThrow(/approved registered outcome event/);
  });

  it("preserves fractional attribution days in the day-based binding contract", () => {
    const binding = buildExperienceBinding({
      pageKey: "/products",
      locale: "",
      schemaId: "layout",
      variantId: "member",
      goalEvent: "commerce.order.paid",
      attributionDays: 2.5,
      approvedGoalEvents: ["commerce.order.paid"],
    });

    expect(binding.attributionWindowDays).toBe(2.5);
    expect(formatAttributionWindowDays(binding.attributionWindowDays)).toBe("2.5");
    expect(formatAttributionWindowDays(30)).toBe("30");
  });

  it("accepts aggregate-only decision summaries and rejects identifiers or invalid rates", () => {
    const summary = {
      audienceKey: "recent_buyer",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T00:00:00.000Z",
      rateLabel: "observational_not_causal",
      rateDenominator: "exposedAccountCount",
      minimumSampleSize: 10,
      bindings: [
        {
          audienceDefinitionVersion: 2,
          bindingId: "binding-1",
          bindingVersion: 1,
          sampleStatus: "available",
          servedDecisionCount: 120,
          renderedDecisionCount: 97,
          exposedAccountCount: 85,
          outcomeAccountCount: 12,
          outcomeRate: 12 / 85,
        },
      ],
    };
    expect(isAggregateAudienceMetrics(summary)).toBe(true);
    expect(
      isAggregateAudienceMetrics({
        ...summary,
        bindings: [
          {
            ...summary.bindings[0],
            sampleStatus: "insufficient_exposed_accounts",
            servedDecisionCount: null,
            renderedDecisionCount: null,
            exposedAccountCount: null,
            outcomeAccountCount: null,
            outcomeRate: null,
          },
        ],
      }),
    ).toBe(true);
    expect(
      isAggregateAudienceMetrics({
        ...summary,
        bindings: [
          {
            ...summary.bindings[0],
            sampleStatus: "insufficient_exposed_accounts",
            servedDecisionCount: 1,
          },
        ],
      }),
    ).toBe(false);
    expect(
      isAggregateAudienceMetrics({
        ...summary,
        bindings: [{ ...summary.bindings[0], users: [{ userId: "must-not-appear" }] }],
      }),
    ).toBe(false);
    expect(
      isAggregateAudienceMetrics({
        ...summary,
        bindings: [{ ...summary.bindings[0], outcomeRate: 1.2 }],
      }),
    ).toBe(false);
    expect(
      isAggregateAudienceMetrics({
        ...summary,
        bindings: [
          {
            ...summary.bindings[0],
            renderedDecisionCount: 13,
            exposedAccountCount: 14,
            outcomeAccountCount: 14,
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("Audience API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses protected metadata, draft-version, and non-persistent validate endpoints", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        const payload = url.endsWith("/activity-types")
          ? { data: [paidActivity] }
          : url.endsWith("/validate")
            ? { data: { valid: true } }
            : { data: { version: 1, status: "draft" } };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(listActivityTypes()).resolves.toEqual([paidActivity]);
    await createAudienceVersion("recent_buyer", {
      activityType: "commerce.order.paid",
      activityVersion: 1,
      condition: { field: "order.status", operator: "equals", value: "paid" },
      action: "assign",
      expiry: { afterMs: 30 * 24 * 60 * 60 * 1000 },
    });
    await expect(validateAudienceVersion("recent_buyer", 1)).resolves.toEqual({ valid: true });

    expect(requests.map(({ url }) => url)).toEqual([
      "/api/audiences/activity-types",
      "/api/audiences/definitions/recent_buyer/versions",
      "/api/audiences/definitions/recent_buyer/versions/1/validate",
    ]);
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
      action: "assign",
      activityType: "commerce.order.paid",
    });
    expect(JSON.parse(String(requests[2]?.init?.body))).toEqual({});
  });
});
