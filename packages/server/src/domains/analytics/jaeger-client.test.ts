import { describe, expect, it } from "vitest";
import { flattenJaegerTrace, summarizeJaegerTrace } from "./jaeger-client";

describe("jaeger-client", () => {
  it("summarizeJaegerTrace picks root span and duration", () => {
    const trace = {
      traceID: "abc123",
      spans: [
        {
          traceID: "abc123",
          spanID: "root",
          operationName: "GET /api/test",
          startTime: 1_700_000_000_000_000,
          duration: 5_000_000,
          tags: [{ key: "org.id", type: "string", value: "org-1" }],
        },
        {
          traceID: "abc123",
          spanID: "child",
          operationName: "pg.query",
          startTime: 1_700_000_001_000_000,
          duration: 1_000_000,
          references: [{ refType: "CHILD_OF", traceID: "abc123", spanID: "root" }],
          tags: [{ key: "org.id", type: "string", value: "org-1" }],
        },
      ],
    };

    const summary = summarizeJaegerTrace(trace);
    expect(summary).toMatchObject({
      traceId: "abc123",
      rootOperation: "GET /api/test",
      durationMs: 5000,
      spanCount: 2,
      hasError: false,
    });
  });

  it("flattenJaegerTrace assigns depth from parent references", () => {
    const trace = {
      traceID: "abc123",
      spans: [
        {
          traceID: "abc123",
          spanID: "root",
          operationName: "GET /api/test",
          startTime: 1,
          duration: 1,
          processID: "p1",
        },
        {
          traceID: "abc123",
          spanID: "child",
          operationName: "pg.query",
          startTime: 2,
          duration: 1,
          processID: "p1",
          references: [{ refType: "CHILD_OF", traceID: "abc123", spanID: "root" }],
        },
      ],
      processes: { p1: { serviceName: "noname-server" } },
    };

    const rows = flattenJaegerTrace(trace);
    expect(rows.find((r) => r.spanId === "root")?.depth).toBe(0);
    expect(rows.find((r) => r.spanId === "child")?.depth).toBe(1);
    expect(rows.find((r) => r.spanId === "child")?.serviceName).toBe("noname-server");
  });
});
