import { describe, expect, it } from "vitest";
import { recordBrowserSpans, resetBrowserTracerForTests } from "./browser-span-export";
import { parseSpanIngest } from "./browser-span-ingest";

const validSpan = {
  traceId: "a".repeat(32),
  spanId: "b".repeat(16),
  parentSpanId: "c".repeat(16),
  name: "document.load",
  startTimeMs: 1_700_000_000_000,
  durationMs: 120,
  attributes: { "browser.service": "noname-browser", "page.path": "/" },
  status: "ok" as const,
};

describe("recordBrowserSpans", () => {
  it("accepts finished browser spans", () => {
    resetBrowserTracerForTests();
    const accepted = recordBrowserSpans("org-1", [validSpan]);
    expect(accepted).toBe(1);
  });

  it("skips invalid spans from ingest parser", () => {
    resetBrowserTracerForTests();
    const { spans } = parseSpanIngest({ spans: [{ ...validSpan, traceId: "bad" }] });
    expect(spans).toHaveLength(0);
    expect(recordBrowserSpans("org-1", spans)).toBe(0);
  });
});
