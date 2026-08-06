import { gunzipSync } from "node:zlib";

export interface ReplayChunkPayload {
  sessionId: string;
  timestamp: number;
  events: unknown[];
}

export function isGzipBuffer(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** Parse replay ingest body — supports legacy JSON and gzip (O3). */
export function parseReplayIngestBody(
  raw: Buffer,
  contentType: string | undefined,
): ReplayChunkPayload {
  const gzip =
    contentType?.includes("application/gzip") === true ||
    contentType?.includes("application/x-gzip") === true ||
    isGzipBuffer(raw);

  const jsonText = gzip ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const body = JSON.parse(jsonText) as {
    sessionId?: string;
    timestamp?: number;
    events?: unknown[];
  };

  return {
    sessionId: body.sessionId ?? "",
    timestamp: body.timestamp ?? Date.now(),
    events: Array.isArray(body.events) ? body.events : [],
  };
}

export function replayChunkExtension(gzip: boolean): string {
  return gzip ? ".json.gz" : ".json";
}
