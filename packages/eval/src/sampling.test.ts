import { describe, expect, it } from "vitest";
import { deterministicSample } from "./sampling";

const routes = ["/", "/products", "/cart", "/about", "/contact", "/blog", "/faq"];

describe("deterministicSample", () => {
  it("is stable for the same tenant, day and limit", () => {
    const a = deterministicSample(routes, { tenantSlug: "yogastore", limit: 4, day: "2026-11-07" });
    const b = deterministicSample(routes, { tenantSlug: "yogastore", limit: 4, day: "2026-11-07" });
    expect(a).toEqual(b);
  });

  it("always includes home", () => {
    for (const day of ["2026-11-07", "2026-11-08", "2026-11-09"]) {
      expect(deterministicSample(routes, { tenantSlug: "yogastore", limit: 2, day })).toContain(
        "/",
      );
    }
  });

  it("rotates across days", () => {
    const days = ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"].map((day) =>
      deterministicSample(routes, { tenantSlug: "yogastore", limit: 3, day }).join(","),
    );
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it("returns all routes when the limit is not smaller", () => {
    expect(deterministicSample(routes, { tenantSlug: "yogastore", limit: 99 })).toEqual(
      [...routes].sort(),
    );
    expect(deterministicSample(routes, { tenantSlug: "yogastore", limit: 0 })).toEqual(
      [...routes].sort(),
    );
  });

  it("is tenant-specific", () => {
    const a = deterministicSample(routes, { tenantSlug: "a", limit: 3, day: "2026-11-07" });
    const b = deterministicSample(routes, { tenantSlug: "b", limit: 3, day: "2026-11-07" });
    expect(a).not.toEqual(b);
  });
});
