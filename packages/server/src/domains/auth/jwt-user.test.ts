import { describe, expect, it } from "vitest";
import { decodeAccessTokenPayload, userIdFromAccessToken } from "./jwt-user";

describe("userIdFromAccessToken", () => {
  it("returns sub from JWT payload", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "user-123" })).toString("base64url");
    const token = `header.${payload}.sig`;
    expect(userIdFromAccessToken(token)).toBe("user-123");
  });

  it("returns null for malformed token", () => {
    expect(userIdFromAccessToken("not-a-jwt")).toBeNull();
  });
});

describe("decodeAccessTokenPayload", () => {
  it("returns parsed payload object", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "user-123", aud: "client" })).toString(
      "base64url",
    );
    const token = `header.${payload}.sig`;
    expect(decodeAccessTokenPayload(token)).toEqual({ sub: "user-123", aud: "client" });
  });
});
