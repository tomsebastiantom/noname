import { describe, expect, it } from "vitest";
import { accessTokenFromRequest } from "./request-token";

function request(headers: Record<string, string>): { headers: Headers } {
  return { headers: new Headers(headers) };
}

describe("accessTokenFromRequest", () => {
  it("reads Bearer token", () => {
    expect(accessTokenFromRequest(request({ Authorization: "Bearer tok-123" }))).toBe("tok-123");
  });

  it("reads access_token cookie", () => {
    expect(accessTokenFromRequest(request({ Cookie: "access_token=cookie-tok; other=1" }))).toBe(
      "cookie-tok",
    );
  });

  it("prefers Authorization over cookie", () => {
    expect(
      accessTokenFromRequest(
        request({ Authorization: "Bearer header-tok", Cookie: "access_token=cookie-tok" }),
      ),
    ).toBe("header-tok");
  });

  it("reads access_token query param for EventSource", () => {
    expect(
      accessTokenFromRequest({
        headers: new Headers(),
        url: "http://yogastore.localhost:5173/api/notifications/stream?access_token=query-tok",
      }),
    ).toBe("query-tok");
  });

  it("returns null when absent", () => {
    expect(accessTokenFromRequest(request({}))).toBeNull();
  });
});
