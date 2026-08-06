import { describe, expect, it } from "vitest";
import { applyMarketingEmailCompliance } from "./marketing-compliance";

describe("applyMarketingEmailCompliance", () => {
  it("appends footer and List-Unsubscribe headers", () => {
    const prefsUrl = "http://yogastore.localhost:5173/account/communication-preferences";
    const result = applyMarketingEmailCompliance(
      { subject: "Sale", html: "<p>Hi</p>", text: "Hi" },
      prefsUrl,
    );
    expect(result.html).toContain(prefsUrl);
    expect(result.text).toContain(prefsUrl);
    expect(result.headers["List-Unsubscribe"]).toBe(`<${prefsUrl}>`);
    expect(result.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
