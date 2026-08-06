import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isGzipBuffer, parseReplayIngestBody, replayChunkExtension } from "./replay-ingest";

describe("parseReplayIngestBody", () => {
  const payload = {
    sessionId: "sess-1",
    timestamp: 1_700_000_000_000,
    events: [{ type: 2 }],
  };

  it("parses legacy JSON body", () => {
    const raw = Buffer.from(JSON.stringify(payload), "utf8");
    expect(parseReplayIngestBody(raw, "application/json")).toEqual(payload);
  });

  it("parses gzip body by content-type", () => {
    const raw = gzipSync(JSON.stringify(payload));
    expect(parseReplayIngestBody(raw, "application/gzip")).toEqual(payload);
  });

  it("parses gzip body by magic bytes", () => {
    const raw = gzipSync(JSON.stringify(payload));
    expect(isGzipBuffer(raw)).toBe(true);
    expect(parseReplayIngestBody(raw, undefined)).toEqual(payload);
  });

  it("round-trips through gunzip for storage read path", () => {
    const raw = gzipSync(JSON.stringify([{ type: 2 }]));
    const json = gunzipSync(raw).toString("utf8");
    expect(JSON.parse(json)).toEqual([{ type: 2 }]);
  });

  it("chooses storage extension", () => {
    expect(replayChunkExtension(true)).toBe(".json.gz");
    expect(replayChunkExtension(false)).toBe(".json");
  });
});
