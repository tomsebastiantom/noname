import { describe, expect, it } from "vitest";
import { clientOpFromRequest } from "./request-audit";

function mockContext(headers: Record<string, string>) {
  return {
    req: {
      header(name: string) {
        const key = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
        return key ? headers[key] : undefined;
      },
    },
  };
}

describe("clientOpFromRequest", () => {
  it("returns client id and seq when headers are valid", () => {
    const result = clientOpFromRequest(
      mockContext({
        "x-client-id": "tab-abc",
        "x-client-seq": "7",
      }) as never,
    );
    expect(result).toEqual({ clientId: "tab-abc", clientSeq: 7 });
  });

  it("ignores invalid seq", () => {
    const result = clientOpFromRequest(
      mockContext({
        "x-client-id": "tab-abc",
        "x-client-seq": "nope",
      }) as never,
    );
    expect(result).toEqual({});
  });

  it("requires both headers", () => {
    expect(clientOpFromRequest(mockContext({ "x-client-id": "tab-abc" }) as never)).toEqual({});
  });
});
