import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { currentRequestId } from "./request-context";
import { requestIdMiddleware } from "./request-id";

function app() {
  const instance = new Hono();
  instance.use("*", requestIdMiddleware);
  instance.get("/", (c) => c.json({ id: currentRequestId(), stored: c.get("requestId") }));
  return instance;
}

describe("requestIdMiddleware", () => {
  it("accepts an upstream id and echoes it", async () => {
    const response = await app().request("/", {
      headers: { "x-request-id": "upstream-12345678" },
    });

    expect(response.headers.get("x-request-id")).toBe("upstream-12345678");
    expect(await response.json()).toEqual({
      id: "upstream-12345678",
      stored: "upstream-12345678",
    });
  });

  it("generates a UUID when the header is absent", async () => {
    const response = await app().request("/");
    const header = response.headers.get("x-request-id");
    const body = (await response.json()) as { id: string; stored: string };

    expect(header).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.id).toBe(header);
    expect(body.stored).toBe(header);
  });

  it("rejects an unsafe upstream id and generates its own", async () => {
    const response = await app().request("/", {
      headers: { "x-request-id": "bad id with spaces" },
    });

    expect(response.headers.get("x-request-id")).not.toBe("bad id with spaces");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
