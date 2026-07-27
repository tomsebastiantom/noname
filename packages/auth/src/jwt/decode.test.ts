import { describe, expect, it } from "vitest";
import { decodeAccessTokenPayload, userIdFromAccessToken } from "./decode";

function jwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  const body = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${body}.sig`;
}

describe("decodeAccessTokenPayload", () => {
  it("decodes payload", () => {
    const token = jwt({ sub: "user-123", aud: "client" });
    expect(decodeAccessTokenPayload(token)).toEqual({ sub: "user-123", aud: "client" });
  });

  it("userIdFromAccessToken reads sub", () => {
    expect(userIdFromAccessToken(jwt({ sub: "user-123" }))).toBe("user-123");
    expect(userIdFromAccessToken("bad")).toBeNull();
  });
});
