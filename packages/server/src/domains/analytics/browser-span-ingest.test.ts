import { describe, expect, it } from "vitest";
import { parseSpanIngest } from "./browser-span-ingest";

const validSpan = {
  traceId: "a".repeat(32),
  spanId: "b".repeat(16),
  parentSpanId: "c".repeat(16),
  name: "fetch GET /api/pages",
  startTimeMs: 1_700_000_000_000,
  durationMs: 42,
  attributes: { "http.method": "GET" },
  status: "ok",
};

describe("parseSpanIngest", () => {
  it("accepts { spans } batch", () => {
    const { spans } = parseSpanIngest({ spans: [validSpan] });
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("fetch GET /api/pages");
  });

  it("rejects invalid trace ids", () => {
    const { spans } = parseSpanIngest({
      spans: [{ ...validSpan, traceId: "too-short" }],
    });
    expect(spans).toHaveLength(0);
  });

  it("caps batch size", () => {
    const batch = Array.from({ length: 120 }, () => validSpan);
    const { spans } = parseSpanIngest({ spans: batch });
    expect(spans.length).toBeLessThanOrEqual(100);
  });
});
