import { describe, expect, it } from "vitest";
import { extractSeoFromLayout, isBotUserAgent, renderBotHtml } from "./bot-ssr";

describe("isBotUserAgent", () => {
  it("detects common crawlers", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("Twitterbot/1.0")).toBe(true);
  });

  it("ignores normal browsers", () => {
    expect(isBotUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120")).toBe(false);
  });
});

describe("extractSeoFromLayout", () => {
  it("collects text from element props", () => {
    const seo = extractSeoFromLayout({
      root: "hero",
      elements: {
        hero: {
          type: "Hero",
          props: { config: {}, labels: { title: "Premium Yoga Mat", subtitle: "Eco cork grip" } },
        },
      },
    });
    expect(seo.title).toBe("Premium Yoga Mat");
    expect(seo.description).toContain("Eco cork grip");
  });
});

describe("renderBotHtml", () => {
  it("escapes HTML in output", () => {
    const html = renderBotHtml(
      { title: "A & B", description: "<script>", snippets: ["Safe"] },
      "yogastore",
    );
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<p>Safe</p>");
  });
});
