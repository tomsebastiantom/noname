import { describe, expect, it } from "vitest";
import { userIdFromAccessToken } from "./jwt-user";

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
