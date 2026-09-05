import { PERMISSIONS } from "@noname/auth";
import { describe, expect, it } from "vitest";
import { verifyAgentToken } from "../../shared/agent-token";
import { mintAgentToken } from "./agent-token";

describe("agent-token", () => {
  const secret = "test-agent-secret";

  it("round-trips signed agent token", () => {
    const token = mintAgentToken(
      {
        agentId: "agent-1",
        agentSlug: "landing-helper",
        orgId: "org-1",
        onBehalfOf: "user-alice",
        permissions: [PERMISSIONS.CONTENT_DRAFT_WRITE],
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    const claims = verifyAgentToken(token, secret);
    expect(claims?.agentSlug).toBe("landing-helper");
    expect(claims?.permissions).toEqual([PERMISSIONS.CONTENT_DRAFT_WRITE]);
  });

  it("rejects tampered token", () => {
    const token = `${mintAgentToken(
      {
        agentId: "agent-1",
        agentSlug: "landing-helper",
        orgId: "org-1",
        onBehalfOf: "user-alice",
        permissions: [PERMISSIONS.CONTENT_DRAFT_WRITE],
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    )}x`;
    expect(verifyAgentToken(token, secret)).toBeNull();
  });
});
