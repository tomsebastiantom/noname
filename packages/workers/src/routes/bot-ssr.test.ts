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

  it("renders richText CMS fields as HTML and plain meta text", () => {
    const seo = extractSeoFromLayout({
      root: "card",
      elements: {
        card: {
          type: "ProductCard",
          props: {
            config: {
              title: "Blue Sneakers",
              description: {
                nodeType: "document",
                content: [
                  {
                    nodeType: "paragraph",
                    content: [{ nodeType: "text", value: "Soft sole", marks: [{ type: "bold" }] }],
                  },
                  {
                    nodeType: "unordered-list",
                    content: [
                      {
                        nodeType: "list-item",
                        content: [{ nodeType: "text", value: "Lightweight", marks: [] }],
                      },
                    ],
                  },
                ],
              },
            },
            labels: {},
          },
        },
      },
    });
    expect(seo.description).toContain("Soft sole");
    expect(seo.description).toContain("Lightweight");
    expect(seo.richHtml[0]).toContain("<strong>Soft sole</strong>");
    expect(seo.richHtml[0]).toContain("<ul><li>Lightweight</li></ul>");
  });
});

describe("renderBotHtml", () => {
  it("escapes HTML in output", () => {
    const html = renderBotHtml(
      { title: "A & B", description: "<script>", snippets: ["Safe"], richHtml: [] },
      "yogastore",
    );
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<p>Safe</p>");
  });

  it("includes pre-rendered rich text HTML in body", () => {
    const html = renderBotHtml(
      {
        title: "Product",
        description: "Summary",
        snippets: [],
        richHtml: ["<p><strong>Bold</strong> copy</p>"],
      },
      "yogastore",
    );
    expect(html).toContain("<p><strong>Bold</strong> copy</p>");
  });
});
