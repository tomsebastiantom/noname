import { afterEach, describe, expect, it, vi } from "vitest";
import { mintStreamTicket, verifyStreamTicket } from "./stream-ticket";

describe("stream-ticket", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mints and verifies a ticket", () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-stream-secret");
    const { ticket } = mintStreamTicket("user-1", "org-1");
    const parsed = verifyStreamTicket(ticket);
    expect(parsed).toEqual(expect.objectContaining({ userId: "user-1", orgId: "org-1" }));
  });

  it("rejects tampered ticket", () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-stream-secret");
    const { ticket } = mintStreamTicket("user-1", "org-1");
    expect(verifyStreamTicket(`${ticket}x`)).toBeNull();
  });
});
