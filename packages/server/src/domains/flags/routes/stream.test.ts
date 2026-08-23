import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ORG_ID_KEY } from "../../../shared/org";
import { mintStreamTicket } from "../../notifications/stream-ticket";
import { registerFlagStreamRoutes } from "./stream";

function testApp(orgId: string | null) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (orgId) c.set(ORG_ID_KEY, orgId);
    await next();
  });
  registerFlagStreamRoutes(app);
  return app;
}

describe("flag stream routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("mints an anonymous stream ticket for the header org", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-flag-stream-secret");
    const res = await testApp("org-1").request("/stream/ticket", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { ticket?: string; expiresIn?: number } };
    expect(body.data?.ticket).toBeTruthy();
    expect(body.data?.expiresIn).toBeGreaterThan(0);
  });

  it("connects flag SSE with a valid ticket and no header org", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-flag-stream-secret");
    const { ticket } = mintStreamTicket("", "org-1");
    const res = await testApp(null).request(`/stream?stream_ticket=${encodeURIComponent(ticket)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
  });

  it("rejects an invalid ticket", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-flag-stream-secret");
    const res = await testApp(null).request("/stream?stream_ticket=bogus.ticket");
    expect(res.status).toBe(401);
  });

  it("rejects an expired ticket", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-flag-stream-secret");
    const { ticket } = mintStreamTicket("", "org-1");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
    const res = await testApp(null).request(`/stream?stream_ticket=${encodeURIComponent(ticket)}`);
    expect(res.status).toBe(401);
  });

  it("requires org when no ticket is present", async () => {
    const res = await testApp(null).request("/stream");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("org id required");
  });

  it("returns 503 when WORKER_SERVER_SECRET is unset", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "");
    const res = await testApp("org-1").request("/stream/ticket", { method: "POST" });
    expect(res.status).toBe(503);
  });
});
